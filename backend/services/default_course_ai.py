"""
AI-generated content for platform-wide default courses.

Given a course title/topic, asks Groq to produce full lesson content
(explanatory text, broken into a few lessons) plus a short multiple-choice
quiz — generated once per course and persisted, never regenerated on
subsequent visits.
"""

import json
import logging
import re
from typing import Optional

import httpx

from config.groq_default_course_config import groq_default_course_config

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = """You are a curriculum writer for a stock-market trading education platform aimed at Indian retail traders.
Given a course topic, produce a short, focused course: 2-4 lessons of real explanatory content, plus a 5-question multiple-choice quiz testing that content.

Rules:
- Lesson content must be genuinely educational prose (150-300 words per lesson), not filler or headings only.
- Use INR examples and NSE/BSE context where relevant.
- Each quiz question has exactly 4 answer choices with exactly one correct choice.
- Quiz questions must be answerable strictly from the lesson content you wrote.
- Respond with ONLY valid JSON, no prose, no markdown fences, matching this exact shape:
{"lessons": [{"title": "...", "content": "..."}], "quiz": {"title": "...", "pass_score": 70, "questions": [{"text": "...", "choices": [{"text": "...", "is_correct": true}, {"text": "...", "is_correct": false}, {"text": "...", "is_correct": false}, {"text": "...", "is_correct": false}]}]}}
"""


class DefaultCourseAIError(Exception):
    pass


def _extract_json(raw: str) -> Optional[dict]:
    text = (raw or "").strip()
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


async def generate_default_course_content(course_title: str, course_description: str = "") -> dict:
    """Returns {"lessons": [{"title", "content"}], "quiz": {"title", "pass_score", "questions": [...]}}."""
    api_key = groq_default_course_config.get_api_key()
    if not api_key:
        raise DefaultCourseAIError("Default course generation is not configured on this server.")

    user_prompt = f"Course topic: {course_title}\n"
    if course_description:
        user_prompt += f"Focus: {course_description}\n"

    payload = {
        "model": groq_default_course_config.DEFAULT_MODEL,
        "messages": [
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        "max_tokens": groq_default_course_config.MAX_TOKENS,
        "temperature": groq_default_course_config.TEMPERATURE,
        "response_format": {"type": "json_object"},
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            response = await client.post(
                groq_default_course_config.API_URL,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
        except httpx.TimeoutException as exc:
            raise DefaultCourseAIError("The AI took too long to generate this course. Please try again.") from exc
        except httpx.RequestError as exc:
            raise DefaultCourseAIError("Could not reach the AI course generator.") from exc

        if response.status_code in (400, 404) and "model" in (response.text or "").lower():
            payload["model"] = groq_default_course_config.FALLBACK_MODEL
            response = await client.post(
                groq_default_course_config.API_URL,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )

    if response.status_code != 200:
        logger.error("Default course AI error: %s - %s", response.status_code, response.text)
        raise DefaultCourseAIError("The AI course generator returned an error. Please try again.")

    data = response.json()
    choices = data.get("choices") or []
    if not choices:
        raise DefaultCourseAIError("The AI returned an empty response.")

    content = (choices[0].get("message") or {}).get("content", "")
    parsed = _extract_json(content)
    if not parsed or not isinstance(parsed.get("lessons"), list) or not isinstance(parsed.get("quiz"), dict):
        logger.error("Default course AI returned unparseable content: %s", content[:500])
        raise DefaultCourseAIError("The AI response could not be understood. Please try again.")

    lessons = []
    for l in parsed["lessons"]:
        title = (l.get("title") or "").strip()
        body = (l.get("content") or "").strip()
        if title and body:
            lessons.append({"title": title, "content": body})

    if not lessons:
        raise DefaultCourseAIError("The AI didn't return any usable lesson content. Please try again.")

    quiz_raw = parsed["quiz"]
    questions = []
    for q in quiz_raw.get("questions") or []:
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

    return {
        "lessons": lessons,
        "quiz": {
            "title": (quiz_raw.get("title") or "Course Quiz").strip(),
            "pass_score": int(quiz_raw.get("pass_score") or 70),
            "questions": questions,
        },
    }
