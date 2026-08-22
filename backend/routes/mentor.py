"""
AI Mentor routes — Grok-powered chat endpoint.

Flow:
    1. Frontend sends user message to POST /api/mentor
    2. Backend verifies user authentication
    3. Backend calls provider API with system prompt
    4. Backend returns AI response
    5. Frontend displays the response
"""

import logging
import json
import re
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Literal, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config.grok_config import grok_config
from database.connection import get_db
from engines.market_session import market_session
from models.algo import AlgoStrategy
from models.futures_order import FuturesOrder, FuturesPosition
from models.order import Order
from models.portfolio import Holding, Portfolio
from models.user import User
from routes.auth import get_current_user
from strategies.zeroloss.manager import zeroloss_manager
from services.intent_detector import intent_detector, MentorIntent
from services.prompt_loader import prompt_loader
from services.conversation_analyzer import conversation_analyzer, ConversationAnalysis
from services.portfolio_intelligence import portfolio_intelligence

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/mentor", tags=["AI Mentor"])

DISCLAIMER = "Educational only — not SEBI investment advice."
WELCOME_MESSAGE = (
    "Hi, I'm Sarah — your AlphaSync mentor. I can help with product navigation, "
    "F&O basics, position risk checks, and safe trade steps. Tell me your question "
    "or paste your position details."
)
OUT_OF_SCOPE_REFUSAL = (
    "That's a bit outside my lane, honestly — I'm your trading mentor here, not a general assistant, "
    "so I can't help with that one. Happy to dig into your portfolio, an F&O concept, or anything "
    "AlphaSync-related instead — just say the word."
)
SENSITIVE_REFUSAL = (
    "I can't get into AlphaSync's internal code, credentials, or anyone's private account details — "
    "that's not something I'll share, no matter how it's asked. But I can absolutely walk you through "
    "how to use any feature in the app, if that helps."
)

FRIENDLY_OUT_OF_SCOPE_REFUSAL = (
    "That's not really something I can help with — I'm focused on the Indian stock market and "
    "AlphaSync, not general topics like that. Want to talk through your portfolio, an options concept, "
    "or something else on the trading side instead?"
)

STRICT_OUT_OF_SCOPE_REFUSAL = (
    "I can't answer that — it's outside the stock market and AlphaSync topics I'm here to help with. "
    "Let's keep it to trading."
)

FRIENDLY_ADULT_REFUSAL = (
    "I'm going to steer us away from that — let's keep this space focused on trading and the markets. "
    "If you've got questions about Nifty, options, or your own positions, I'm right here for that."
)

STRICT_ADULT_REFUSAL = (
    "That's not something I'll respond to. Please keep questions focused on trading and AlphaSync."
)

FINAL_INSTRUCTION_PREFIX = "=== INSTRUCTION ==="


_LEGACY_PREFIXES = [
    "reply in very simple words for a beginner trader in india. focus only on indian markets and alphasync usage.",
]


def _normalize_user_message(message: str) -> str:
    """Normalize user text and strip known legacy instruction prefixes."""
    raw = (message or "").strip()
    if not raw:
        return ""

    lowered = raw.lower()
    for prefix in _LEGACY_PREFIXES:
        if lowered.startswith(prefix):
            cleaned = raw[len(prefix) :].lstrip("\n\r\t :-")
            return cleaned or raw

    return raw


def _extract_ai_reply(payload: dict) -> str:
    """Extract assistant text from chat-completions payload variants."""
    if not isinstance(payload, dict):
        return ""

    choices = payload.get("choices") or []
    if not choices:
        return ""

    message = (choices[0] or {}).get("message") or {}
    content = message.get("content")

    if isinstance(content, str):
        return content.strip()

    if isinstance(content, list):
        chunks = [part.get("text", "") for part in content if isinstance(part, dict)]
        return "".join(chunks).strip()

    return ""


def _build_warm_scope_redirect() -> str:
    return _ensure_disclaimer(OUT_OF_SCOPE_REFUSAL)


def _build_sensitive_refusal() -> str:
    return _ensure_disclaimer(SENSITIVE_REFUSAL)


def _money(value: Any) -> float:
    if value is None:
        return 0.0
    if isinstance(value, Decimal):
        return float(value)
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _iso(value: Any) -> Optional[str]:
    return value.isoformat() if hasattr(value, "isoformat") else None


def _first_name(user: User) -> str:
    name = (user.full_name or user.username or "").strip()
    return (name.split()[0] if name else "Trader")[:40]


def _ensure_disclaimer(reply: str) -> str:
    text = (reply or "").strip()
    if not text:
        return "I can help with AlphaSync usage, Indian market learning, and safer trade steps."
    return text


def _sanitize_reply(reply: str) -> str:
    text = (reply or "").strip()
    lowered = text.lower()
    if "api key" in lowered or "secret" in lowered or "credential" in lowered:
        return _build_sensitive_refusal()
    text = text.replace("Alex", "Sarah")
    return _ensure_disclaimer(text)


def _format_recent_messages(messages: list["RecentMessage"]) -> str:
    normalized = [
        {
            "role": item.role,
            "content": item.content[:1200],
            "timestamp": item.timestamp,
        }
        for item in (messages or [])[-6:]
        if item.content and item.role in {"user", "assistant"}
    ]
    return json.dumps(normalized, ensure_ascii=False)


def _assemble_model_prompt(
    user_context: dict[str, Any],
    recent_messages: list["RecentMessage"],
    analysis: ConversationAnalysis,
) -> str:
    # 1. Load and combine templates for all detected intents (Sprint 2)
    prompt_segments = []
    for intent in analysis.intents:
        segment = prompt_loader.get_prompt(intent)
        if segment not in prompt_segments:
            prompt_segments.append(segment)
    
    combined_system_prompt = "\n\n---\n\n".join(prompt_segments)

    # 2. Format Conversation Metadata for LLM awareness (Sprint 1)
    metadata_lines = [
        "=== CONVERSATION METADATA ===",
        f"Primary Intents: {', '.join([i.value for i in analysis.intents])}",
        f"Is Follow-Up Query: {analysis.is_follow_up}",
        f"Is Emotional State: {analysis.is_emotional}",
        f"Requires Portfolio Analysis: {analysis.requires_portfolio}",
        f"Has Multiple Questions: {analysis.has_multiple_questions}",
        f"Is Website Help: {analysis.is_website_help}",
    ]
    metadata_str = "\n".join(metadata_lines)

    # 3. Follow-up context resolution instruction (Sprint 4)
    follow_up_instruction = ""
    if analysis.is_follow_up:
        follow_up_instruction = (
            "=== CONTEXT RESOLUTION INSTRUCTION ===\n"
            "The user's query is detected as a follow-up to previous messages. "
            "Resolve pronouns like 'it', 'that', or 'this' based on the chat history. "
            "Do not repeat greetings or introductory information. Focus directly on answering the follow-up.\n"
        )

    return "\n".join(
        [
            combined_system_prompt,
            metadata_str,
            follow_up_instruction,
            "=== USER CONTEXT ===",
            json.dumps(user_context, ensure_ascii=False, default=str),
            "=== RECENT MESSAGES ===",
            _format_recent_messages(recent_messages),
            FINAL_INSTRUCTION_PREFIX,
            grok_config.FINAL_INSTRUCTION,
        ]
    )


def _build_route_map_reply(message: str) -> str:
    text = (message or "").strip().lower()

    if any(word in text for word in ["add capital", "reset capital", "capital", "funds"]):
        return (
            "Route: Sidebar → Settings → Trading → Capital Management → Add Capital / Reset Capital\n"
            "Steps:\n"
            "1) Open Settings from the left sidebar.\n"
            "2) Go to the Trading section.\n"
            "3) Scroll to Capital Management.\n"
            "4) Use Add Capital to increase funds or Reset Capital to return to default."
        )

    if any(word in text for word in ["reset account", "clear account", "delete all positions"]):
        return (
            "Route: Sidebar → Settings → Trading → Account Reset → Reset Account\n"
            "Steps:\n"
            "1) Open Settings from the left sidebar.\n"
            "2) Go to Trading section.\n"
            "3) Find Account Reset and click Reset Account.\n"
            "4) Confirm the warning to continue."
        )

    if any(word in text for word in ["order", "orders", "order history"]):
        return "Route: Sidebar → Orders\nYou can view pending, completed, and rejected orders there."

    if any(word in text for word in ["portfolio", "holdings", "p&l"]):
        return "Route: Sidebar → Portfolio\nYou can view holdings, invested value, and P&L from this page."

    if any(word in text for word in ["watchlist", "market watch", "symbol list"]):
        return "Route: Sidebar → Market\nUse Market to track symbols and build your watchlist quickly."

    if any(word in text for word in ["where", "how to", "how do i", "settings", "route", "map"]):
        return (
            "Route Map:\n"
            "- Dashboard: Sidebar → Dashboard\n"
            "- Terminal: Sidebar → Terminal\n"
            "- Market: Sidebar → Market\n"
            "- Portfolio: Sidebar → Portfolio\n"
            "- Orders: Sidebar → Orders\n"
            "- AI Mentor: Sidebar → AI Mentor\n"
            "- Capital tools: Sidebar → Settings → Trading"
        )

    return ""


def _build_fallback_reply(message: str, user_first_name: str = "Trader") -> str:
    """Generate conversational fallback reply for unconfigured/offline LLM using ConversationAnalyzer."""
    text = re.sub(r"[^\w\s\-₹]", " ", message.strip().lower())
    text = " ".join(text.split())

    # 1. Run Conversation Analyzer (stateless mode for offline fallback check)
    analysis = conversation_analyzer.analyze(message)

    # 2. Hard block for sensitive queries (safety guardrail)
    if MentorIntent.SENSITIVE in analysis.intents:
        return _build_sensitive_refusal()

    if MentorIntent.ADULT in analysis.intents:
        return FRIENDLY_ADULT_REFUSAL

    if MentorIntent.OUT_OF_SCOPE in analysis.intents:
        return FRIENDLY_OUT_OF_SCOPE_REFUSAL

    # 3. Route mapping helper (only for navigation/website-help queries, so it
    # doesn't hijack education questions that happen to contain "how to")
    if analysis.is_website_help or MentorIntent.NAVIGATION in analysis.intents:
        route_help = _build_route_map_reply(message)
        if route_help:
            return route_help

    # 4. Generate segment replies for each detected intent
    reply_segments = []

    for intent in analysis.intents:
        if intent == MentorIntent.GREETING:
            reply_segments.append(
                f"Hello {user_first_name}! 👋\n\n"
                "Nice to see you. How can I help you today?\n"
                "• Explain AlphaSync features\n"
                "• Review my Portfolio\n"
                "• Learn Trading concepts"
            )
        elif intent == MentorIntent.SMALL_TALK:
            reply_segments.append(
                "I'm doing well, thanks for asking! 😊 Ready to help you learn trading or navigate AlphaSync.\n"
                "What would you like to explore today?"
            )
        elif intent == MentorIntent.IDENTITY:
            reply_segments.append(
                "I'm Sarah, AlphaSync's AI Mentor.\n\n"
                "I can help you:\n"
                "• Learn the Indian stock market (NSE/BSE)\n"
                "• Understand AlphaSync features and routes\n"
                "• Explain trading and risk management concepts\n"
                "• Review your portfolio exposure and P&L\n\n"
                "I'm here to support your learning journey, but please note that I won't provide investment advice or discuss unrelated topics."
            )
        elif intent == MentorIntent.EMOTION:
            reply_segments.append(
                "I understand trading can feel overwhelming or stressful at times. 😊\n\n"
                "Remember, protecting your capital is always the first rule. Let's look at your portfolio together, "
                "or we can go over some simple risk management strategies like defining daily loss limits and placing stop-losses."
            )
        elif intent == MentorIntent.NAVIGATION:
            reply_segments.append(
                "Sure! If you're looking for settings or capital tools, you can find them under:\n"
                "Route: Sidebar → Settings → Trading\n\n"
                "Let me know if you need specific step-by-step guidance for any feature!"
            )
        elif intent == MentorIntent.OUT_OF_SCOPE:
            reply_segments.append(_build_warm_scope_redirect())

    # 5. If nothing has matched, try keyword checks and default fallback
    if not reply_segments:
        if any(phrase in text for phrase in ["teach me trading", "teach me to trade", "how to trade", "learn trading", "trading basics", "what is trading", "define trading"]) or text.startswith("what is trade"):
            reply_segments.append(
                "Trading means buying and selling market products like stocks, futures, or options to benefit "
                "from price movement. Here's how to start learning:\n"
                "1) Understand the instrument (equity, futures, options) and how price moves.\n"
                "2) Always define your stop-loss before entering a trade.\n"
                "3) Size your position so a loss never hurts more than you can afford.\n"
                "4) Practice with small quantities first, in AlphaSync's simulated environment.\n"
                "Ask me about any of these — options, futures, stop-loss, or risk management — and I'll go deeper."
            )
        elif any(phrase in text for phrase in ["what is options", "what are options", "options trading", "explain options", "option contract"]) or text.strip() == "options":
            reply_segments.append(
                "Options are contracts that give you the right (not obligation) to buy (Call) or sell (Put) a "
                "stock/index at a fixed price (strike price) before a set expiry date.\n"
                "- Call option: right to buy — used when you expect price to go up.\n"
                "- Put option: right to sell — used when you expect price to go down.\n"
                "- You pay a small amount called 'premium' to buy an option.\n"
                "Example: If Nifty is at 22,000 and you expect it to rise, you could buy a Nifty Call option "
                "near that strike price. If Nifty rises, the option's value usually rises too.\n"
                "Options can lose their full premium value, so always trade small size and understand the risk first."
            )
        elif any(phrase in text for phrase in ["what is futures", "what are futures", "futures trading", "explain futures", "future contract"]):
            reply_segments.append(
                "A futures contract is an agreement to buy or sell a stock/index at a fixed price on a future date. "
                "Unlike options, both parties are obligated to fulfill the contract at expiry.\n"
                "Futures use margin — you only put up a fraction of the total contract value, which means gains "
                "and losses are amplified. Always use a stop-loss when trading futures."
            )
        elif any(phrase in text for phrase in ["what is risk management", "define risk", "risk management"]):
            reply_segments.append(
                "Risk management means protecting your money first. Keep trade size small, place stop-loss, "
                "set a daily loss limit, and avoid overtrading."
            )
        elif any(phrase in text for phrase in ["what is portfolio", "portfolio management", "manage my portfolio"]):
            reply_segments.append(
                "Portfolio management means tracking what stocks you hold, how much money is invested, "
                "and when to rebalance or book profits."
            )
        elif any(phrase in text for phrase in ["what is indicator", "what are indicators", "rsi", "macd", "ema", "sma"]):
            reply_segments.append(
                "Indicators are helper tools to understand trend and momentum. "
                "Use them as support, not as the only reason to take a trade."
            )
        elif any(phrase in text for phrase in ["what is chart", "candlestick", "candle", "timeframe"]):
            reply_segments.append(
                "A chart shows price movement over time. Candles help you see whether buyers or sellers are stronger."
            )
        elif any(phrase in text for phrase in ["what is zero loss", "zero loss", "zeroloss", "zll", "alpha auto"]):
            reply_segments.append(
                "Alpha Auto is the strategy section in AlphaSync. It helps you follow a planned process "
                "with better discipline and safer trade handling."
            )
        elif any(word in text for word in ["stop loss", "stoploss", "sl order"]):
            reply_segments.append(
                "A stop-loss is a pre-set exit that limits loss if price goes against you. "
                "It is one of the most important safety rules in trading."
            )
        elif any(word in text for word in ["nifty", "sensex", "bse", "nse"]):
            reply_segments.append(
                "NSE and BSE are India's two main stock exchanges. Nifty 50 (NSE) and Sensex (BSE) are benchmark "
                "indices tracking the top companies listed there — they're used to gauge overall market direction."
            )
        elif any(word in text for word in ["intraday", "mis", "cnc", "delivery"]):
            reply_segments.append(
                "Intraday (MIS) means you buy and sell within the same trading day — positions are auto-squared-off "
                "before market close. Delivery (CNC) means you hold the shares beyond the day, taking actual ownership."
            )
        elif any(word in text for word in ["margin", "hedging", "derivative"]):
            reply_segments.append(
                "Margin is the deposit you put up to take a leveraged position. Hedging means taking an offsetting "
                "position to reduce risk. Derivatives (like futures and options) derive their value from an underlying asset like a stock or index."
            )
        elif any(word in text for word in ["risk", "loss", "drawdown"]):
            reply_segments.append(
                "The safest way to trade is to decide maximum loss first, then choose position size. "
                "If the loss feels too large, reduce the quantity."
            )
        elif any(word in text for word in ["portfolio", "p&l", "profit", "loss"]):
            reply_segments.append(
                "Your portfolio is the list of stocks you own. Review profits/losses regularly and avoid too much concentration in one stock."
            )

    # Final combined response
    if reply_segments:
        return "\n\n---\n\n".join(reply_segments)

    return (
        "I'm still learning how to answer that one directly, but I'm here to help with AlphaSync features, "
        "NSE/BSE trading concepts (options, futures, stop-loss, risk management), and your portfolio. "
        "Try rephrasing your question, or ask me something like 'what is options' or 'how do I set a stop-loss'."
    )


async def _build_user_context(
    db: AsyncSession,
    user: User,
    *,
    client_time: Optional[str] = None,
    session_id: Optional[str] = None,
) -> dict[str, Any]:
    portfolio_result = await db.execute(
        select(Portfolio).where(Portfolio.user_id == user.id)
    )
    portfolio = portfolio_result.scalar_one_or_none()

    holdings: list[Holding] = []
    if portfolio:
        holdings_result = await db.execute(
            select(Holding)
            .where(Holding.portfolio_id == portfolio.id, Holding.quantity != 0)
            .limit(8)
        )
        holdings = list(holdings_result.scalars().all())

    futures_positions_result = await db.execute(
        select(FuturesPosition)
        .where(FuturesPosition.user_id == user.id, FuturesPosition.quantity != 0)
        .limit(8)
    )
    futures_positions = list(futures_positions_result.scalars().all())

    open_positions: list[dict[str, Any]] = [
        {
            "symbol": holding.symbol,
            "qty": int(holding.quantity or 0),
            "entry": _money(holding.avg_price),
            "cmp": _money(holding.current_price),
            "pnl_inr": _money(holding.pnl),
            "type": "equity",
        }
        for holding in holdings
    ]
    open_positions.extend(
        {
            "symbol": position.contract_symbol,
            "qty": int(position.quantity or 0),
            "entry": _money(position.avg_entry_price),
            "cmp": _money(position.current_price),
            "pnl_inr": _money(position.unrealized_pnl),
            "type": "futures",
        }
        for position in futures_positions
    )

    orders_result = await db.execute(
        select(Order)
        .where(Order.user_id == user.id)
        .order_by(Order.created_at.desc())
        .limit(5)
    )
    orders = list(orders_result.scalars().all())

    futures_orders_result = await db.execute(
        select(FuturesOrder)
        .where(FuturesOrder.user_id == user.id)
        .order_by(FuturesOrder.created_at.desc())
        .limit(3)
    )
    futures_orders = list(futures_orders_result.scalars().all())

    recent_orders = [
        {
            "symbol": order.symbol,
            "side": order.side,
            "qty": int(order.quantity or 0),
            "price": _money(order.filled_price or order.price),
            "status": order.status,
            "created_at": _iso(order.created_at),
        }
        for order in orders
    ]
    recent_orders.extend(
        {
            "symbol": order.contract_symbol,
            "side": order.side,
            "qty": int(order.quantity or 0),
            "price": _money(order.filled_price or order.price),
            "status": order.status,
            "created_at": _iso(order.created_at),
        }
        for order in futures_orders
    )
    recent_orders.sort(key=lambda item: item.get("created_at") or "", reverse=True)

    strategy_result = await db.execute(
        select(AlgoStrategy)
        .where(AlgoStrategy.user_id == user.id, AlgoStrategy.is_active.is_(True))
        .order_by(AlgoStrategy.updated_at.desc())
        .limit(1)
    )
    active_strategy = strategy_result.scalar_one_or_none()

    try:
        alpha_auto_enabled = await zeroloss_manager.is_user_enabled(user.id)
    except Exception:
        logger.exception("Failed to read Alpha Auto status for mentor context")
        alpha_auto_enabled = False

    session = market_session.get_session_info()
    market_status = "OPEN" if session.get("state") == "open" else "CLOSED"
    pnl_value = _money(portfolio.total_pnl if portfolio else 0)
    pnl_value += sum(_money(position.unrealized_pnl) for position in futures_positions)

    return {
        "user_id": str(user.id),
        "first_name": _first_name(user),
        "available_capital_inr": _money(
            portfolio.available_capital if portfolio else user.virtual_capital
        ),
        "pnl_today_inr": pnl_value,
        "invested_capital_inr": _money(portfolio.total_invested if portfolio else 0),
        "open_positions": open_positions[:10],
        "recent_orders": recent_orders[:6],
        "active_strategy": active_strategy.name if active_strategy else None,
        "alpha_auto_status": "ON" if alpha_auto_enabled else "OFF",
        "market_status": market_status,
        "client_locale": "en-IN",
        "session_id": session_id,
        "client_time": client_time or datetime.now(timezone.utc).isoformat(),
    }


def _risk_level_from_context(user_context: dict[str, Any]) -> str:
    available = _money(user_context.get("available_capital_inr"))
    invested = _money(user_context.get("invested_capital_inr"))
    pnl_today = _money(user_context.get("pnl_today_inr"))
    open_positions = user_context.get("open_positions") or []
    capital_base = max(available + invested, 1.0)
    exposure_ratio = invested / capital_base
    pnl_ratio = abs(pnl_today) / capital_base

    if pnl_today < 0 and (pnl_ratio >= 0.02 or len(open_positions) >= 5 or exposure_ratio >= 0.75):
        return "high"
    if pnl_today < 0 or exposure_ratio >= 0.45 or len(open_positions) >= 3:
        return "medium"
    return "low"


class RecentMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(default="", max_length=2000)
    timestamp: Optional[Any] = None


class MentorMessageRequest(BaseModel):
    """User message payload."""

    message: str
    recent_messages: list[RecentMessage] = Field(default_factory=list, max_length=8)
    client_time: Optional[str] = None
    session_id: Optional[str] = None
    refusal_style: Optional[str] = "friendly"


class MentorMessageResponse(BaseModel):
    """AI Mentor response payload."""

    reply: str
    success: bool = True
    error: Optional[str] = None
    provider: Optional[str] = None
    model: Optional[str] = None
    flagged: bool = False
    refusal: bool = False


@router.post("", response_model=MentorMessageResponse)
async def chat_with_mentor(
    request: MentorMessageRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MentorMessageResponse:
    """Chat with AI Mentor."""
    api_key = grok_config.get_api_key()
    user_message = _normalize_user_message(request.message)
    user_first_name = _first_name(current_user)

    if not user_message or len(user_message) > 2000:
        raise HTTPException(
            status_code=400,
            detail="Message must be between 1 and 2000 characters",
        )

    # 1. Run Conversation Analyzer (Sprint 1) and Multi-Intent Detection (Sprint 2)
    analysis = conversation_analyzer.analyze(user_message, request.recent_messages)

    # 2. Hard block for sensitive queries (safety guardrail)
    if MentorIntent.SENSITIVE in analysis.intents:
        return MentorMessageResponse(
            reply=_build_sensitive_refusal(),
            success=True,
            flagged=True,
            refusal=True,
        )

    refusal_style = (request.refusal_style or "friendly").strip().lower()

    # 18+ adult content block
    if MentorIntent.ADULT in analysis.intents:
        reply = STRICT_ADULT_REFUSAL if refusal_style == "strict" else FRIENDLY_ADULT_REFUSAL
        return MentorMessageResponse(
            reply=_ensure_disclaimer(reply),
            success=True,
            flagged=True,
            refusal=True,
        )

    # Out of scope block
    if MentorIntent.OUT_OF_SCOPE in analysis.intents:
        reply = STRICT_OUT_OF_SCOPE_REFUSAL if refusal_style == "strict" else FRIENDLY_OUT_OF_SCOPE_REFUSAL
        return MentorMessageResponse(
            reply=_ensure_disclaimer(reply),
            success=True,
            flagged=True,
            refusal=True,
        )

    user_context = await _build_user_context(
        db,
        current_user,
        client_time=request.client_time,
        session_id=request.session_id,
    )

    # 3. Inject Portfolio Risk Intelligence (Sprint 3)
    if analysis.requires_portfolio:
        intel = portfolio_intelligence.analyze_portfolio(user_context)
        user_context["portfolio_intelligence"] = intel

    if not api_key:
        logger.warning("Mentor API key not configured")
        return MentorMessageResponse(
            reply=_ensure_disclaimer(_build_fallback_reply(user_message, user_first_name=user_first_name)),
            success=True,
        )

    try:
        provider = grok_config.get_provider(api_key)
        api_url = grok_config.get_api_url(api_key)
        model = grok_config.get_model(api_key)

        payload = {
            "model": model,
            "messages": [
                {
                    "role": "system",
                    "content": _assemble_model_prompt(
                        user_context,
                        request.recent_messages[-6:],
                        analysis,
                    ),
                },
                {"role": "user", "content": user_message},
            ],
            "max_tokens": grok_config.MAX_TOKENS,
            "temperature": grok_config.TEMPERATURE,
            "top_p": grok_config.TOP_P,
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                api_url,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )

            fallback_models = (
                [grok_config.GROQ_DEFAULT_MODEL, grok_config.GROQ_FALLBACK_MODEL]
                if provider == "groq"
                else [grok_config.XAI_DEFAULT_MODEL]
            )

            for fallback_model in fallback_models:
                if response.status_code not in (400, 404) or model == fallback_model:
                    continue
                body_text = (response.text or "").lower()
                if "model" not in body_text:
                    continue
                model = fallback_model
                payload["model"] = fallback_model
                response = await client.post(
                    api_url,
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json",
                    },
                    json=payload,
                )

        if response.status_code != 200:
            logger.error("Mentor API error: %s - %s", response.status_code, response.text)
            return MentorMessageResponse(
                reply=_ensure_disclaimer(_build_fallback_reply(user_message, user_first_name=user_first_name)),
                success=True,
            )

        data = response.json()
        ai_reply = _extract_ai_reply(data)

        if not ai_reply:
            logger.warning("Mentor API returned empty response")
            return MentorMessageResponse(
                reply=_ensure_disclaimer(_build_fallback_reply(user_message, user_first_name=user_first_name)),
                success=True,
            )

        logger.info("Mentor response generated for user %s", current_user.id)
        return MentorMessageResponse(
            reply=_sanitize_reply(ai_reply),
            success=True,
            provider=provider,
            model=payload.get("model"),
        )

    except httpx.TimeoutException:
        logger.error("Mentor API timeout")
        return MentorMessageResponse(
            reply=_ensure_disclaimer(_build_fallback_reply(user_message, user_first_name=user_first_name)),
            success=True,
        )

    except httpx.RequestError as exc:
        logger.error("Mentor API request error: %s", exc)
        return MentorMessageResponse(
            reply=_ensure_disclaimer(_build_fallback_reply(user_message, user_first_name=user_first_name)),
            success=True,
        )

    except Exception as exc:
        logger.error("Unexpected mentor error: %s", exc, exc_info=True)
        return MentorMessageResponse(
            reply=_ensure_disclaimer(_build_fallback_reply(user_message, user_first_name=user_first_name)),
            success=True,
        )


@router.get("/status", tags=["AI Mentor"])
async def mentor_status():
    """Check if AI Mentor is available and configured."""
    is_configured, message = grok_config.validate()
    api_key = grok_config.get_api_key()
    provider = grok_config.get_provider(api_key) if is_configured else None
    return {
        "available": is_configured,
        "status": message,
        "provider": provider,
        "model": (grok_config.get_model(api_key) if is_configured else None),
    }


@router.get("/welcome", tags=["AI Mentor"])
async def mentor_welcome():
    """Stateless welcome copy for a new mentor session."""
    return {"message": _ensure_disclaimer(WELCOME_MESSAGE)}


@router.get("/context-hints", tags=["AI Mentor"])
async def mentor_context_hints(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Lightweight live risk hints for the frontend without storing chats."""
    context = await _build_user_context(db, current_user)
    return {
        "risk_level": _risk_level_from_context(context),
        "pnl_today_inr": context["pnl_today_inr"],
        "open_positions_count": len(context["open_positions"]),
        "market_status": context["market_status"],
        "alpha_auto_status": context["alpha_auto_status"],
    }
