"""
AI-generated MCQ question service for the Course Builder.

Given a course's combined lesson material text plus a question count and
difficulty (both set by faculty beforehand), asks Groq to produce
structured multiple-choice questions with exactly one correct choice each.
"""

import json
import logging
import re
from typing import Optional

import httpx

from config.groq_assessment_config import groq_assessment_config

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = """You are an assessment writer for a stock-market trading education platform.
Generate multiple-choice questions strictly based on the provided lesson material.

Rules:
- Each question has exactly 4 answer choices.
- Exactly one choice per question must be correct.
- Questions must be answerable from the given material — do not invent facts.
- Keep questions clear and unambiguous, appropriate for the requested difficulty.
- Respond with ONLY valid JSON, no prose, no markdown fences, matching this exact shape:
{"questions": [{"text": "...", "choices": [{"text": "...", "is_correct": true}, {"text": "...", "is_correct": false}, {"text": "...", "is_correct": false}, {"text": "...", "is_correct": false}]}]}
"""


class AssessmentAIError(Exception):
    pass


def _extract_json(raw: str) -> Optional[dict]:
    text = (raw or "").strip()
    # Strip markdown code fences if the model added them despite instructions.
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip(), flags=re.MULTILINE)
    try:
        return json.loads(text)
    except (json.JSONDecodeError, TypeError):
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if match:
            try:
                return json.loads(match.group(0))
            except json.JSONDecodeError:
                return None
    return None


async def generate_mcq_questions(
    material_text: str,
    question_count: int,
    difficulty: str,
    course_title: str,
) -> list[dict]:
    """Returns a list of {"text": str, "choices": [{"text": str, "is_correct": bool}, ...]}."""
    api_key = groq_assessment_config.get_api_key()
    if not api_key:
        raise AssessmentAIError("AI question generation is not configured on this server.")

    if not material_text or not material_text.strip():
        raise AssessmentAIError("No lesson material text available to generate questions from. Add a lesson with an uploaded file or written content first.")

    user_prompt = (
        f"Course: {course_title}\n"
        f"Difficulty: {difficulty}\n"
        f"Number of questions: {question_count}\n\n"
        f"Lesson material:\n{material_text[:12000]}"
    )

    payload = {
        "model": groq_assessment_config.DEFAULT_MODEL,
        "messages": [
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        "max_tokens": groq_assessment_config.MAX_TOKENS,
        "temperature": groq_assessment_config.TEMPERATURE,
        "response_format": {"type": "json_object"},
    }

    async with httpx.AsyncClient(timeout=45.0) as client:
        try:
            response = await client.post(
                groq_assessment_config.API_URL,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
        except httpx.TimeoutException as exc:
            raise AssessmentAIError("The AI took too long to respond. Try a smaller question count.") from exc
        except httpx.RequestError as exc:
            raise AssessmentAIError("Could not reach the AI question generator.") from exc

        if response.status_code in (400, 404) and "model" in (response.text or "").lower():
            payload["model"] = groq_assessment_config.FALLBACK_MODEL
            response = await client.post(
                groq_assessment_config.API_URL,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )

    if response.status_code != 200:
        logger.error("Assessment AI error: %s - %s", response.status_code, response.text)
        raise AssessmentAIError("The AI question generator returned an error. Please try again.")

    data = response.json()
    choices = data.get("choices") or []
    if not choices:
        raise AssessmentAIError("The AI returned an empty response.")

    content = (choices[0].get("message") or {}).get("content", "")
    parsed = _extract_json(content)
    if not parsed or not isinstance(parsed.get("questions"), list):
        logger.error("Assessment AI returned unparseable content: %s", content[:500])
        raise AssessmentAIError("The AI response could not be understood. Please try again.")

    questions = []
    for q in parsed["questions"][:question_count]:
        text = (q.get("text") or "").strip()
        raw_choices = q.get("choices") or []
        if not text or len(raw_choices) < 2:
            continue
        parsed_choices = [
            {"text": (c.get("text") or "").strip(), "is_correct": bool(c.get("is_correct"))}
            for c in raw_choices
            if (c.get("text") or "").strip()
        ]
        if not any(c["is_correct"] for c in parsed_choices):
            continue
        questions.append({"text": text, "choices": parsed_choices})

    if not questions:
        raise AssessmentAIError("The AI didn't return any usable questions. Please try again.")

    return questions
