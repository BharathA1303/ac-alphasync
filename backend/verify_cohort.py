import asyncio
import json
import models
from database.connection import async_session_factory
from models.user import User
from routes.faculty_cohort import (
    get_cohort_overview, get_cohort_standings, get_mastery_heatmap,
    get_weak_concepts, get_at_risk_learners, get_behaviour_distribution
)
from sqlalchemy import select

async def verify():
    async with async_session_factory() as db:
        faculty = (await db.execute(select(User).where(User.role == 'faculty'))).scalars().first()
        print('Faculty User:', faculty.email, faculty.id)

        ov = await get_cohort_overview(course_id=None, faculty=faculty, db=db)
        print('\n=== 1. OVERVIEW (REAL KPIs) ===')
        for k, v in ov.items():
            print(f" {k}: value={v['value']}, subtext='{v['subtext']}', trend='{v['trend']}'")

        st = await get_cohort_standings(course_id=None, faculty=faculty, db=db)
        print(f"\n=== 2. STANDINGS ({len(st['standings'])} students) ===")
        for s in st['standings']:
            print(f" Rank {s['rank']}: {s['name']} ({s['email']}) | Process={s['process_score']} | SL={s['stop_loss_usage_pct']}% | Return={s['return_pct']}% | Mastery={s['mastery_score']}%")
        print(" Insight:", st['insight_banner']['description'])

        ar = await get_at_risk_learners(course_id=None, faculty=faculty, db=db)
        print(f"\n=== 3. AT RISK LEARNERS ({len(ar['learners'])}) ===")
        for a in ar['learners']:
            print(f" Flagged: {a['name']} ({a['email']}) | Tag: {a['diagnostic_tag']} | Risk: {a['risk_type']} | Severity: {a['severity']}")

        bd = await get_behaviour_distribution(course_id=None, faculty=faculty, db=db)
        print(f"\n=== 4. BEHAVIOUR DISTRIBUTION (Cohort size: {bd['total_cohort']}) ===")
        for b in bd['benchmarks']:
            print(f" {b['title']}: {b['count']} of {b['total']} ({b['percentage']}%)")

        wk = await get_weak_concepts(course_id=None, faculty=faculty, db=db)
        print(f"\n=== 5. WEAK CONCEPTS ({len(wk['weak_concepts'])}) ===")
        for w in wk['weak_concepts']:
            print(f" Concept: {w['concept']} | Mastery: {w['mastery_percent']}% | Students below: {w['students_below_threshold']}")

        hm = await get_mastery_heatmap(course_id=None, faculty=faculty, db=db)
        print(f"\n=== 6. HEATMAP ({len(hm['matrix'])} Quartiles) ===")
        for r in hm['matrix']:
            scores_preview = [f"{s['module_code']}={s['score_percent']}%" for s in r['scores'][:4]]
            print(f" {r['quartile']} ({r['description']}): {', '.join(scores_preview)}...")

if __name__ == '__main__':
    asyncio.run(verify())
