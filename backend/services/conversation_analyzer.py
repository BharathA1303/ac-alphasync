import re
from typing import List, Any
from pydantic import BaseModel
from services.intent_detector import intent_detector, MentorIntent

class ConversationAnalysis(BaseModel):
    """Result of structural analysis on user query."""
    intents: List[MentorIntent]
    is_follow_up: bool
    is_emotional: bool
    requires_portfolio: bool
    has_multiple_questions: bool
    is_website_help: bool


class ConversationAnalyzer:
    """
    Analyzes user queries for contextual features: follow-ups, emotional triggers, 
    portfolio requests, multi-question payloads, and navigation/help topics.
    """

    # Query tokens showing pronouns or follow-up continuations
    FOLLOW_UP_TRIGGERS = {
        "it", "that", "this", "them", "those", "why", "how so", "explain more",
        "tell me more", "simplify", "easier", "repeat", "what does it mean",
        "why did that happen", "how to do it", "how do i do it", "and", "also",
        "again", "clarify", "elaborate"
    }

    @classmethod
    def analyze(cls, message: str, recent_messages: List[Any] = None) -> ConversationAnalysis:
        if not message:
            return ConversationAnalysis(
                intents=[MentorIntent.EDUCATION],
                is_follow_up=False,
                is_emotional=False,
                requires_portfolio=False,
                has_multiple_questions=False,
                is_website_help=False
            )

        text = message.strip().lower()
        cleaned_text = re.sub(r"[^\w\s\-\u20b9₹]", "", text)
        compact_text = " ".join(cleaned_text.split())

        # 1. Multi-Intent Detection (Sprint 2)
        intents = []
        
        # Check Sensitive, Adult & Out of Scope (strictly prioritized)
        if any(keyword in compact_text for keyword in intent_detector.SENSITIVE_KEYWORDS):
            intents.append(MentorIntent.SENSITIVE)
        if any(keyword in compact_text for keyword in intent_detector.ADULT_KEYWORDS):
            intents.append(MentorIntent.ADULT)
        if any(keyword in compact_text for keyword in intent_detector.OUT_OF_SCOPE_KEYWORDS):
            intents.append(MentorIntent.OUT_OF_SCOPE)

        # Check other intents independently to allow combinations
        if any(keyword in compact_text for keyword in intent_detector.GREETING_KEYWORDS) or any(compact_text.startswith(kw + " ") for kw in intent_detector.GREETING_KEYWORDS):
            intents.append(MentorIntent.GREETING)
            
        if any(keyword in compact_text for keyword in intent_detector.SMALL_TALK_KEYWORDS):
            intents.append(MentorIntent.SMALL_TALK)
            
        if any(keyword in compact_text for keyword in intent_detector.IDENTITY_KEYWORDS):
            intents.append(MentorIntent.IDENTITY)
            
        if any(keyword in compact_text for keyword in intent_detector.EMOTION_KEYWORDS) or re.search(r"(lost|loss|minus|negative).*(rs|inr|₹|\d)", compact_text):
            intents.append(MentorIntent.EMOTION)
            
        if any(keyword in compact_text for keyword in intent_detector.NAVIGATION_KEYWORDS):
            intents.append(MentorIntent.NAVIGATION)
            
        if any(keyword in compact_text for keyword in intent_detector.PORTFOLIO_KEYWORDS):
            intents.append(MentorIntent.PORTFOLIO)
            
        if any(keyword in compact_text for keyword in intent_detector.EDUCATION_KEYWORDS):
            intents.append(MentorIntent.EDUCATION)

        # Fallback to EDUCATION if no intents are matched
        if not intents:
            intents.append(MentorIntent.EDUCATION)

        # Remove duplicate intents while preserving order
        unique_intents = []
        for i in intents:
            if i not in unique_intents:
                unique_intents.append(i)

        # 2. Follow-Up Detection (Sprint 4)
        is_follow_up = False
        words = set(compact_text.split())
        # Check if the query has explicit follow-up tokens
        if words.intersection(cls.FOLLOW_UP_TRIGGERS):
            is_follow_up = True
        # If there is active chat history, short queries are likely follow-ups
        elif recent_messages and len(recent_messages) > 0:
            if len(compact_text.split()) <= 4:
                is_follow_up = True

        # 3. Emotional Detection
        is_emotional = (MentorIntent.EMOTION in unique_intents) or any(kw in compact_text for kw in ["afraid", "panic", "greedy", "scared", "pain", "stress"])

        # 4. Requires Portfolio
        requires_portfolio = (MentorIntent.PORTFOLIO in unique_intents) or is_emotional or any(kw in compact_text for kw in ["pnl", "profit", "holdings", "position", "exposure"])

        # 5. Has Multiple Questions
        has_multiple_questions = (len(unique_intents) > 1) or (message.count("?") > 1) or any(conn in compact_text for conn in ["and also", "as well as", "and tell me", "also explain"])

        # 6. Website Help
        is_website_help = (MentorIntent.NAVIGATION in unique_intents) or any(kw in compact_text for kw in ["route", "find settings", "locate"])

        return ConversationAnalysis(
            intents=unique_intents,
            is_follow_up=is_follow_up,
            is_emotional=is_emotional,
            requires_portfolio=requires_portfolio,
            has_multiple_questions=has_multiple_questions,
            is_website_help=is_website_help
        )


# Export service instance
conversation_analyzer = ConversationAnalyzer()
