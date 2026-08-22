import re
from enum import Enum
from typing import Set

class MentorIntent(str, Enum):
    GREETING = "GREETING"
    SMALL_TALK = "SMALL_TALK"
    IDENTITY = "IDENTITY"
    EMOTION = "EMOTION"
    NAVIGATION = "NAVIGATION"
    EDUCATION = "EDUCATION"
    PORTFOLIO = "PORTFOLIO"
    SENSITIVE = "SENSITIVE"
    OUT_OF_SCOPE = "OUT_OF_SCOPE"
    ADULT = "ADULT"


class IntentDetector:
    """Lightweight, fast keyword and regex-based Intent Detector for the AI Mentor."""

    # SENSITIVE: Protect internal source code, architecture, credentials, database details
    SENSITIVE_KEYWORDS: Set[str] = {
        "source code", "backend code", "frontend code", "internal code", "database schema",
        "db schema", "api key", "secret key", "access token", "password", "credentials",
        "server config", "production config", "internal architecture", "private endpoint",
        "provider key", "llm key", "model key", "database password", "kyc details",
        "account number", "user email", "user phone", "personal info", "personal information"
    }

    # ADULT: 18+ content, inappropriate queries
    ADULT_KEYWORDS: Set[str] = {
        "porn", "sexy", "sex", "xxx", "nsfw", "naked", "nude", "boobs", "penis", "vagina",
        "erotic", "orgasm", "intercourse", "hentai", "playboy", "adult content", "strip club",
        "lust", "sensual", "condom", "fetish", "breast", "asshole", "fuck", "bitch", "slut",
        "hooker", "prostitute", "orgasm", "masturbate", "escort", "blowjob", "striptease"
    }

    # OUT_OF_SCOPE: Topics completely unrelated to Indian stock market or AlphaSync features
    OUT_OF_SCOPE_KEYWORDS: Set[str] = {
        "weather", "movie", "cinema", "netflix", "cricket", "football", "ipl score",
        "politics", "election", "medical", "doctor", "diagnosis", "symptom", "medicine",
        "legal advice", "court", "lawsuit", "religion", "god", "horoscope", "astrology",
        "zodiac", "recipe", "cooking", "coding", "python", "javascript", "java",
        "c++", "programming", "script", "sql query", "html", "css", "write me a",
        "us stock", "nasdaq", "nyse", "s&p 500", "dow jones", "bitcoin", "ethereum",
        "dogecoin", "forex", "claude", "anthropic", "chatgpt", "openai", "gemini ai",
        "international market", "song", "lyrics", "poem", "joke", "riddle",
        "travel", "vacation", "flight ticket", "hotel booking", "video game",
        "relationship advice", "dating", "homework", "essay", "translate this",
        "who is the prime minister", "capital of", "gym workout", "diet plan",
        "tell me a story", "write a story"
    }

    # IDENTITY: Who is Sarah and what does she do?
    IDENTITY_KEYWORDS: Set[str] = {
        "who are you", "what is your name", "what can you do", "what are you",
        "introduce yourself", "tell me about yourself", "who is sarah",
        "your capability", "your features", "who are u", "what is ur name"
    }

    # GREETING: Standard greetings
    GREETING_KEYWORDS: Set[str] = {
        "hi", "hello", "hey", "hii", "namaste", "good morning", "good afternoon",
        "good evening", "greetings", "hello sarah", "hi sarah", "hey sarah"
    }

    # SMALL_TALK: Casual chat
    SMALL_TALK_KEYWORDS: Set[str] = {
        "how are you", "how is it going", "how's it going", "how are you doing",
        "doing well", "how's your day", "nice day", "good day", "how do you do",
        "how is life", "whats up", "what's up"
    }

    # EMOTION: Psychological triggers, panic, fear, losses
    # Note: bare "loss"/"losses" are intentionally excluded — they collide with
    # education questions like "stop loss" / "what is a loss". Emotional intent
    # is instead inferred from specific phrases or the amount-based regex below.
    EMOTION_KEYWORDS: Set[str] = {
        "scared", "afraid", "panic", "lost money", "recovery",
        "stressed", "stressed out", "worried", "sad", "greedy", "revenge",
        "fear", "pain", "angry", "frustrated", "lose money"
    }

    # NAVIGATION: Locating settings, buttons, routing inside the app
    NAVIGATION_KEYWORDS: Set[str] = {
        "where is", "how do i go", "how to find", "navigation", "route", "map",
        "settings", "profile", "add capital", "reset account", "capital management",
        "reset capital", "where to find", "locate", "how to reset"
    }

    # PORTFOLIO: Personal performance, holdings, P&L, orders
    PORTFOLIO_KEYWORDS: Set[str] = {
        "portfolio", "holdings", "p&l", "my trades", "my orders", "positions",
        "balance", "available capital", "invested capital", "what do i hold",
        "my holdings", "my portfolio", "my positions", "pnl", "profit and loss"
    }

    # EDUCATION: Learning concepts (derivatives, margin, indicators)
    EDUCATION_KEYWORDS: Set[str] = {
        "options", "futures", "trading basics", "what is trading", "stop loss",
        "risk management", "rsi", "macd", "indicator", "candle", "candlestick",
        "nifty", "sensex", "bse", "nse", "equity", "delivery", "intraday",
        "mis", "cnc", "derivative", "margin", "hedging", "how to trade"
    }

    @classmethod
    def detect_intent(cls, message: str) -> MentorIntent:
        """
        Classifies the user message into a MentorIntent.
        Runs deterministic regex and keyword matches.
        """
        if not message:
            return MentorIntent.EDUCATION

        # Normalize text: lowercase and strip extra spacing/common punctuation
        text = message.strip().lower()
        cleaned_text = re.sub(r"[^\w\s\-\u20b9₹]", "", text)  # Keep letters, numbers, spaces, hyphens, and currency symbols
        compact_text = " ".join(cleaned_text.split())

        # 1. SENSITIVE (Highest priority for security reasons)
        if any(keyword in compact_text for keyword in cls.SENSITIVE_KEYWORDS):
            return MentorIntent.SENSITIVE

        # 2. ADULT (Safety guardrail)
        if any(keyword in compact_text for keyword in cls.ADULT_KEYWORDS):
            return MentorIntent.ADULT

        # 3. OUT_OF_SCOPE
        if any(keyword in compact_text for keyword in cls.OUT_OF_SCOPE_KEYWORDS):
            return MentorIntent.OUT_OF_SCOPE

        # 3. IDENTITY
        if any(keyword in compact_text for keyword in cls.IDENTITY_KEYWORDS):
            return MentorIntent.IDENTITY

        # 4. GREETING (Exact matches or starting prefixes)
        if compact_text in cls.GREETING_KEYWORDS or any(compact_text.startswith(kw + " ") for kw in cls.GREETING_KEYWORDS):
            return MentorIntent.GREETING

        # 5. SMALL_TALK
        if any(keyword in compact_text for keyword in cls.SMALL_TALK_KEYWORDS):
            return MentorIntent.SMALL_TALK

        # 6. EMOTION (Traders experiencing stress/fear or talking about losses)
        if any(keyword in compact_text for keyword in cls.EMOTION_KEYWORDS) or re.search(r"(lost|loss|minus|negative).*(rs|inr|₹|\d)", compact_text):
            return MentorIntent.EMOTION

        # 7. NAVIGATION
        if any(keyword in compact_text for keyword in cls.NAVIGATION_KEYWORDS):
            return MentorIntent.NAVIGATION

        # 8. PORTFOLIO
        if any(keyword in compact_text for keyword in cls.PORTFOLIO_KEYWORDS):
            return MentorIntent.PORTFOLIO

        # 9. EDUCATION
        if any(keyword in compact_text for keyword in cls.EDUCATION_KEYWORDS):
            return MentorIntent.EDUCATION

        # Default fallback is EDUCATION (for general trading assistance)
        return MentorIntent.EDUCATION


# Export service instance
intent_detector = IntentDetector()
