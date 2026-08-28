"""
AlphaSync Rate Limiter — Redis-backed request throttling middleware.

Provides per-IP rate limiting for auth endpoints (login, register)
to prevent brute-force attacks. Uses a sliding window counter stored in Redis.
Falls back to in-memory if Redis is unavailable.

Implemented as a pure ASGI middleware rather than Starlette's
BaseHTTPMiddleware. BaseHTTPMiddleware runs the downstream app in a
separate task group via call_next(), and if that inner task times out or
is cancelled (e.g. a route's own asyncio.wait_for(..., timeout=...)
expiring), the cancellation can race with call_next()'s stream consumption
and surface as "RuntimeError: No response returned" — a 500 with no
useful traceback, even when the route already handles the timeout itself.
A plain ASGI middleware calls the downstream app directly in the same
task, so no such race exists.

Usage:
    Applied as FastAPI middleware in main.py.
"""

import time
import logging
from collections import defaultdict
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

logger = logging.getLogger(__name__)

# Rate limit configurations per path prefix
RATE_LIMITS = {
    "/api/auth/sync": {"max_requests": 10, "window_seconds": 60},
    "/api/auth/me": {"max_requests": 30, "window_seconds": 60},
    "/api/auth/logout": {"max_requests": 10, "window_seconds": 60},
    "/api/auth/forgot-password": {"max_requests": 5, "window_seconds": 60},
    "/api/auth/reset-password": {"max_requests": 10, "window_seconds": 60},
    "/api/auth/login-direct": {"max_requests": 15, "window_seconds": 60},
    "/api/auth/register-direct": {"max_requests": 10, "window_seconds": 60},
    # Admin endpoints — strict rate limiting
    "/api/admin/auth": {"max_requests": 5, "window_seconds": 60},
    "/api/admin/": {"max_requests": 180, "window_seconds": 60},
    # Market data endpoints are read-only cached data — allow high throughput
    "/api/market/": {"max_requests": 10000, "window_seconds": 60},
    # Futures endpoints get their own bucket — allow high throughput
    "/api/futures/": {"max_requests": 10000, "window_seconds": 60},
    # Options endpoints get their own bucket — allow high throughput
    "/api/options/": {"max_requests": 10000, "window_seconds": 60},
}

# Default rate limit for all other API endpoints
DEFAULT_RATE_LIMIT = {"max_requests": 1000, "window_seconds": 60}

# Redis key prefix for rate limiting
_RL_PREFIX = "alphasync:ratelimit"


class RateLimitMiddleware:
    """
    Sliding-window rate limiter keyed by client IP + path prefix.

    Uses Redis sorted sets for persistence across restarts.
    Falls back to in-memory dict if Redis is unavailable.
    Skips non-API paths (static files, WebSocket, health).

    Pure ASGI middleware — see module docstring for why this isn't
    Starlette's BaseHTTPMiddleware.
    """

    def __init__(self, app: ASGIApp):
        self.app = app
        # In-memory fallback
        self._requests: dict[tuple, list[float]] = defaultdict(list)
        self._last_cleanup = time.time()
        self._cleanup_interval = 300  # 5 minutes

    async def _get_redis(self):
        """Try to get the Redis connection, return None if unavailable."""
        try:
            from cache.redis_client import _price_cache

            if _price_cache and _price_cache._redis:
                return _price_cache._redis
        except Exception:
            pass
        return None

    async def __call__(self, scope: Scope, receive: Receive, send: Send):
        if scope["type"] != "http":
            # WebSocket/lifespan — pass through untouched.
            await self.app(scope, receive, send)
            return

        request = Request(scope, receive=receive)
        path = request.url.path

        # Skip non-API paths and health checks
        if not path.startswith("/api/") or path == "/api/health":
            await self.app(scope, receive, send)
            return

        client_ip = self._extract_client_ip(request)

        # Find matching rate limit config
        config = DEFAULT_RATE_LIMIT
        matched_prefix = "default"
        for prefix, limit_config in RATE_LIMITS.items():
            if path.startswith(prefix):
                config = limit_config
                matched_prefix = prefix
                break

        max_requests = config["max_requests"]
        window = config["window_seconds"]
        now = time.time()

        # Keep buckets scoped to the matched prefix, so strict limits on
        # /api/admin/auth don't get consumed by /api/admin/users requests.
        path_group = matched_prefix.replace("/", ":")

        # Try Redis first, fall back to in-memory
        redis = await self._get_redis()
        if redis:
            is_limited, retry_after, count = await self._check_redis(
                redis, client_ip, path_group, max_requests, window, now
            )
        else:
            is_limited, retry_after, count = self._check_memory(
                client_ip, path_group, max_requests, window, now
            )

        if is_limited:
            logger.warning(
                f"Rate limit exceeded: {client_ip} on {path} "
                f"({count}/{max_requests} in {window}s)"
            )
            response = JSONResponse(
                status_code=429,
                content={
                    "detail": "Too many requests. Please try again later.",
                    "retry_after": retry_after,
                },
                headers={"Retry-After": str(retry_after)},
            )
            await response(scope, receive, send)
            return

        await self.app(scope, receive, send)

    def _extract_client_ip(self, request: Request) -> str:
        """Resolve the best-effort client IP behind reverse proxies."""
        # Preferred order for common proxy stacks: Cloudflare -> Nginx -> direct.
        for header in ("cf-connecting-ip", "x-forwarded-for", "x-real-ip"):
            raw = (request.headers.get(header) or "").strip()
            if not raw:
                continue
            if header == "x-forwarded-for":
                # RFC 7239 style: client, proxy1, proxy2
                raw = raw.split(",", 1)[0].strip()
            if raw:
                return raw

        return request.client.host if request.client else "unknown"

    async def _check_redis(
        self,
        redis,
        client_ip: str,
        path_group: str,
        max_requests: int,
        window: int,
        now: float,
    ) -> tuple[bool, int, int]:
        """Sliding window check using Redis sorted set."""
        key = f"{_RL_PREFIX}:{client_ip}:{path_group}"
        cutoff = now - window

        try:
            pipe = redis.pipeline()
            # Remove expired entries
            pipe.zremrangebyscore(key, 0, cutoff)
            # Count current entries
            pipe.zcard(key)
            results = await pipe.execute()
            count = results[1]

            if count >= max_requests:
                # Get the oldest entry to calculate retry_after
                oldest = await redis.zrange(key, 0, 0, withscores=True)
                if oldest:
                    retry_after = int(window - (now - oldest[0][1])) + 1
                else:
                    retry_after = window
                return True, retry_after, count

            # Add the current request
            pipe2 = redis.pipeline()
            pipe2.zadd(key, {f"{now}": now})
            pipe2.expire(key, window + 10)  # TTL slightly longer than window
            await pipe2.execute()
            return False, 0, count + 1

        except Exception as e:
            logger.warning(f"Redis rate limit check failed, using in-memory: {e}")
            return self._check_memory(client_ip, path_group, max_requests, window, now)

    def _check_memory(
        self,
        client_ip: str,
        path_group: str,
        max_requests: int,
        window: int,
        now: float,
    ) -> tuple[bool, int, int]:
        """In-memory fallback sliding window check."""
        key = (client_ip, path_group)

        # Clean old timestamps
        self._requests[key] = [ts for ts in self._requests[key] if now - ts < window]

        if len(self._requests[key]) >= max_requests:
            retry_after = int(window - (now - self._requests[key][0])) + 1
            return True, retry_after, len(self._requests[key])

        self._requests[key].append(now)

        # Periodic cleanup of expired entries
        if now - self._last_cleanup > self._cleanup_interval:
            self._cleanup(now)
            self._last_cleanup = now

        return False, 0, len(self._requests[key])

    def _cleanup(self, now: float):
        """Remove expired entries to prevent memory growth."""
        max_window = max(c["window_seconds"] for c in RATE_LIMITS.values())
        expired_keys = [
            key
            for key, timestamps in self._requests.items()
            if not timestamps or (now - timestamps[-1]) > max_window
        ]
        for key in expired_keys:
            del self._requests[key]
