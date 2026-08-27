import asyncio
import models
from database.connection import async_session_factory
from models import Assessment, AssessmentAttempt, AttemptAnswer, Course, Lesson
from sqlalchemy import select

async def check_assessments():
    async with async_session_factory() as db:
        assessments = (await db.execute(select(Assessment))).scalars().all()
        print(f"=== ASSESSMENTS ({len(assessments)}) ===")
        for a in assessments:
            print(f"ID={a.id} | Title={a.title} | CourseID={a.course_id} | PassScore={a.pass_score}")

        courses = (await db.execute(select(Course))).scalars().all()
        print(f"\n=== COURSES ({len(courses)}) ===")
        for c in courses:
            print(f"ID={c.id} | Title={c.title}")

if __name__ == "__main__":
    asyncio.run(check_assessments())
