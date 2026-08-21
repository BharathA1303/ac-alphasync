import os
from pathlib import Path
from services.intent_detector import MentorIntent


class PromptLoader:
    """Loads and caches prompt templates dynamically from backend/prompts/."""

    def __init__(self):
        self.current_dir = Path(__file__).resolve().parent
        self.prompts_dir = self.current_dir.parent / "prompts"
        self._cache = {}

    def get_prompt(self, intent: MentorIntent) -> str:
        """Fetches the prompt template for the given intent (cached)."""
        if intent in self._cache:
            return self._cache[intent]

        # Map intent to filename
        filename_map = {
            MentorIntent.GREETING: "greeting.txt",
            MentorIntent.SMALL_TALK: "small_talk.txt",
            MentorIntent.IDENTITY: "identity.txt",
            MentorIntent.EMOTION: "emotion.txt",
            MentorIntent.NAVIGATION: "navigation.txt",
            MentorIntent.EDUCATION: "education.txt",
            MentorIntent.PORTFOLIO: "portfolio.txt",
            MentorIntent.SENSITIVE: "redirect.txt",
            MentorIntent.OUT_OF_SCOPE: "redirect.txt",
            MentorIntent.ADULT: "redirect.txt",
        }

        filename = filename_map.get(intent, "education.txt")
        file_path = self.prompts_dir / filename

        try:
            if file_path.is_file():
                content = file_path.read_text(encoding="utf-8").strip()
                self._cache[intent] = content
                return content
            else:
                # Baseline default if file is missing
                fallback = (
                    "You are Sarah, the official AI Mentor for AlphaSync. Your personality is warm, "
                    "professional, patient, confident, friendly, and calm. Guide the user regarding "
                    "AlphaSync features, risk management, and Indian stock markets."
                )
                self._cache[intent] = fallback
                return fallback
        except Exception:
            # Return a simple fallback on error to prevent application crashes
            return (
                "You are Sarah, the official AI Mentor for AlphaSync. Your personality is warm, "
                "professional, patient, confident, friendly, and calm."
            )


# Export loader instance
prompt_loader = PromptLoader()
