// api.js - Axios instance with JWT auth token handling and rate limit backoff
import axios from 'axios';
import { clearUserSessionCookie } from '../utils/authSessionCookie';

const api = axios.create({
    baseURL: '/api',
    headers: { 'Content-Type': 'application/json' },
    timeout: 15000,
});

/**
 * 429 backoff tracker — when rate-limited, pause ALL requests until cooldown expires.
 */
let _rateLimitedUntil = 0;
export const isRateLimited = () => Date.now() < _rateLimitedUntil;

// Add JWT auth token to every request
api.interceptors.request.use(async (config) => {
    // If we're in a 429 cooldown, reject immediately for polling/market requests
    if (
        isRateLimited() &&
        config.url?.includes('/market/') &&
        !config.url?.includes('/market/search')
    ) {
        return Promise.reject(new axios.Cancel('Rate limited — backing off'));
    }

    // Broker connect/refresh calls may retry across multiple broker API
    // hosts server-side — give them more room than the default 15s.
    if (config.url?.includes('/broker/')) {
        config.timeout = 35000;
    }

    // Commodity lists fan out many Zebu REST calls server-side.
    if (config.url?.includes('/market/commodities')) {
        config.timeout = 30000;
    }

    // Read JWT from localStorage (set by useAuthStore after login/register)
    try {
        const token = localStorage.getItem('alphasync_token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
    } catch {
        // Ignore — request proceeds without auth
    }
    return config;
});

// Handle 401 and 429 responses
api.interceptors.response.use(
    (response) => response,
    async (error) => {
        // 429 — rate limited
        if (error.response?.status === 429) {
            const retryAfter = parseInt(error.response.headers?.['retry-after'] || '30', 10);
            _rateLimitedUntil = Date.now() + retryAfter * 1000;
            console.warn(`[API] Rate limited — backing off for ${retryAfter}s`);
            return Promise.reject(error);
        }

        if (
            error.response?.status === 401 &&
            !error.config?.url?.includes('/auth/logout')
        ) {
            _forceLogout();
        }

        return Promise.reject(error);
    }
);

function _forceLogout() {
    localStorage.removeItem('alphasync_token');
    localStorage.removeItem('alphasync_user');
    clearUserSessionCookie();
    if (window.location.pathname !== '/login') {
        window.location.href = '/login';
    }
}

export default api;
