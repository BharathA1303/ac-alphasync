import asyncio
import json
import models
from database.connection import async_session_factory
from models.user import User
from routes.institution_compliance import (
    get_compliance_overview, get_compliance_gates, get_data_sources,
    get_audit_trail, get_ai_guardrail, get_disclosure_and_engagement,
    export_evidence_pack
)
from sqlalchemy import select

async def verify():
    async with async_session_factory() as db:
        admin = (await db.execute(select(User).where(User.role == 'institution_admin'))).scalars().first()
        if not admin:
            admin = (await db.execute(select(User).where(User.role == 'admin'))).scalars().first()
        print('Admin User:', admin.email, admin.id, 'Institution:', admin.institution_id)

        ov = await get_compliance_overview(admin=admin, db=db)
        print('\n=== 1. COMPLIANCE OVERVIEW ===')
        print(f" Status: {ov['status']}, Lag: {ov['lag_hero']['lag_days']}d (Floor: {ov['lag_hero']['configured_floor_days']}d)")
        print(f" Attestations: {ov['counters']['consecutive_attestations']}, Violations: {ov['counters']['violations_since_launch']}, Audit records: {ov['counters']['audit_records_count']}")

        gt = await get_compliance_gates(admin=admin, db=db)
        print(f"\n=== 2. GATES ({len(gt['gates'])}) ===")
        for g in gt['gates']:
            print(f" {g['id']}: {g['title']} [{g['mechanism']}] -> {g['status']}")

        ds = await get_data_sources(admin=admin, db=db)
        print(f"\n=== 3. DATA SOURCES ({len(ds['sources'])}) ===")
        for s in ds['sources']:
            print(f" {s['source']}: {s['scope']} | {s['expires']} | {s['status']}")

        at = await get_audit_trail(admin=admin, db=db)
        print(f"\n=== 4. AUDIT TRAIL ({len(at['daily_volume'])} days) ===")
        print(f" Written today: {at['records_written_today']}, Chain head: {at['chain_head_published']}, Retention: {at['retention']}")

        ai = await get_ai_guardrail(admin=admin, db=db)
        print(f"\n=== 5. AI GUARDRAIL ===")
        print(f" Advisory reaching learner: {ai['advisory_responses_reaching_learner']}, Generated: {ai['metrics']['responses_generated']}")

        eng = await get_disclosure_and_engagement(admin=admin, db=db)
        print(f"\n=== 6. DISCLOSURE & ENGAGEMENT ({len(eng['disclosures'])}) ===")
        for d in eng['disclosures']:
            print(f" {d['title']}: {d['count']} of {d['total']} ({d['percentage']}%)")

        ev = await export_evidence_pack(req=None, admin=admin, db=db)
        print(f"\n=== 7. EVIDENCE PACK ===")
        print(f" Generated cert: {ev['certificate_id']}, File: {ev['filename']}")

if __name__ == '__main__':
    asyncio.run(verify())
