"""
Groq AI configuration for AI-generated default platform courses (lesson
content + quiz), available to every role except student.

Uses a dedicated API key (GROQ_DEFAULT_COURSE_API_KEY) completely separate
from the AI Mentor's key and the Course Builder's assessment key, so none
of the three features ever share quota or credentials.
"""

import os


class GroqDefaultCourseConfig:
    """Groq API configuration for default-course generation."""

    API_URL: str = "https://api.groq.com/openai/v1/chat/completions"
    DEFAULT_MODEL: str = "openai/gpt-oss-120b"
    FALLBACK_MODEL: str = "openai/gpt-oss-20b"

    MAX_TOKENS: int = 4000
    TEMPERATURE: float = 0.5

    @classmethod
    def get_api_key(cls) -> str:
        return os.getenv("GROQ_DEFAULT_COURSE_API_KEY", "").strip()

    @classmethod
    def is_configured(cls) -> bool:
        return bool(cls.get_api_key())


groq_default_course_config = GroqDefaultCourseConfig()
