"""
Groq AI configuration for the Course Builder's AI-generated MCQ assessments.

Uses a dedicated API key (GROQ_ASSESSMENT_API_KEY) completely separate from
the AI Mentor's key (GROK_API_KEY / GROQ_API_KEY) so the two features never
share quota or credentials.
"""

import os


class GroqAssessmentConfig:
    """Groq API configuration for MCQ generation."""

    API_URL: str = "https://api.groq.com/openai/v1/chat/completions"
    DEFAULT_MODEL: str = "openai/gpt-oss-120b"
    FALLBACK_MODEL: str = "openai/gpt-oss-20b"

    MAX_TOKENS: int = 3000
    TEMPERATURE: float = 0.4

    @classmethod
    def get_api_key(cls) -> str:
        return os.getenv("GROQ_ASSESSMENT_API_KEY", "").strip()

    @classmethod
    def is_configured(cls) -> bool:
        return bool(cls.get_api_key())


groq_assessment_config = GroqAssessmentConfig()
