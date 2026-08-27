import asyncio
import json
import models
from database.connection import async_session_factory
from models import (
    User, Course, Lesson, Assessment, AssessmentAttempt, LessonProgress,
    TradingAssignment, AssignmentSubmission, Order, Portfolio, Holding
)
from sqlalchemy import select, func

async def inspect():
    async with async_session_factory() as db:
        users = (await db.execute(select(User))).scalars().all()
        print(f"=== USERS ({len(users)}) ===")
        for u in users:
            print(f"ID={u.id} | Role={u.role} | Name={u.full_name} | Email={u.email} | Inst={u.institution_id}")

        orders = (await db.execute(select(Order))).scalars().all()
        print(f"\n=== ORDERS ({len(orders)}) ===")
        for o in orders:
            print(f"User={o.user_id} | Sym={o.symbol} | Side={o.side} | Qty={o.quantity} | Px={o.price} | SL={o.trigger_price} | Status={o.status}")

        attempts = (await db.execute(select(AssessmentAttempt))).scalars().all()
        print(f"\n=== ASSESSMENTS ATTEMPTS ({len(attempts)}) ===")
        for a in attempts:
            print(f"User={a.user_id} | Score={a.score_percent}% | TotalQ={a.total_questions} | Passed={a.passed} | Course={a.course_id}")

        subs = (await db.execute(select(AssignmentSubmission))).scalars().all()
        print(f"\n=== ASSIGNMENT SUBMISSIONS ({len(subs)}) ===")
        for s in subs:
            print(f"Student={s.student_id} | Status={s.status} | Grade={s.grade_score}")

        lessons = (await db.execute(select(LessonProgress))).scalars().all()
        print(f"\n=== LESSON PROGRESS ({len(lessons)}) ===")
        for lp in lessons:
            print(f"User={lp.user_id} | Lesson={lp.lesson_id} | Course={lp.course_id}")

        portfolios = (await db.execute(select(Portfolio))).scalars().all()
        print(f"\n=== PORTFOLIOS ({len(portfolios)}) ===")
        for p in portfolios:
            print(f"User={p.user_id} | Cash={p.cash_balance} | Invested={p.invested_value} | RealizedPnL={p.realized_pnl} | UnrealizedPnL={p.unrealized_pnl}")

if __name__ == "__main__":
    asyncio.run(inspect())
