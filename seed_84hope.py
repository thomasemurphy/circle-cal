"""Seed the "84 Hope birthdays" shared calendar.

Finds the admin user by email, creates the calendar (if needed), makes that user
the admin + a visible member, and loads the birthdays from
data/84hope_birthdays.json. Safe to run repeatedly (idempotent).

Usage:
    python seed_84hope.py                         # admin = default email below
    python seed_84hope.py --email you@gmail.com
    python seed_84hope.py --create-user           # create a placeholder admin if none exists (local testing only)

For production, set DATABASE_URL and run the same command (e.g. `heroku run`).
The admin user must have signed in at least once (so their account exists),
unless you pass --create-user.
"""
import argparse
import asyncio
import json
from pathlib import Path

from sqlalchemy import select

from api.database import async_session, init_db
from api.models import User, Calendar, CalendarMembership, Event

DEFAULT_EMAIL = "tommurphyemail@gmail.com"
CALENDAR_NAME = "84 Hope birthdays"
CALENDAR_COLOR = "#6224ff"  # purple
DATA_FILE = Path(__file__).parent / "data" / "84hope_birthdays.json"


async def seed(email: str, create_user: bool):
    await init_db()

    with open(DATA_FILE) as f:
        birthdays = json.load(f)

    async with async_session() as db:
        # 1. Find (or optionally create) the admin user.
        # Prefer a real (Google-authenticated) account over a seed placeholder
        # if both happen to exist for this email.
        result = await db.execute(select(User).where(User.email == email.lower()))
        candidates = result.scalars().all()
        admin = next(
            (u for u in candidates if not (u.google_id or "").startswith("seed-placeholder:")),
            candidates[0] if candidates else None,
        )
        if not admin:
            if not create_user:
                print(
                    f"No user found with email {email!r}.\n"
                    f"Sign in once at the app with that Google account, then re-run.\n"
                    f"(Or pass --create-user to make a placeholder admin for local testing.)"
                )
                return
            admin = User(
                google_id=f"seed-placeholder:{email.lower()}",
                email=email.lower(),
                name=email.split("@")[0],
            )
            db.add(admin)
            await db.flush()
            print(f"Created placeholder admin user {email!r} (id={admin.id})")

        # 2. Find or create the calendar
        result = await db.execute(
            select(Calendar).where(
                Calendar.name == CALENDAR_NAME,
                Calendar.admin_user_id == admin.id,
            )
        )
        calendar = result.scalars().first()
        if not calendar:
            calendar = Calendar(
                name=CALENDAR_NAME,
                color=CALENDAR_COLOR,
                admin_user_id=admin.id,
            )
            db.add(calendar)
            await db.flush()
            print(f"Created calendar {CALENDAR_NAME!r} (id={calendar.id})")
        else:
            print(f"Calendar {CALENDAR_NAME!r} already exists (id={calendar.id})")

        # 3. Ensure the admin has a visible membership
        result = await db.execute(
            select(CalendarMembership).where(
                CalendarMembership.calendar_id == calendar.id,
                CalendarMembership.user_id == admin.id,
            )
        )
        membership = result.scalar_one_or_none()
        if not membership:
            db.add(CalendarMembership(
                calendar_id=calendar.id,
                user_id=admin.id,
                is_visible=True,
            ))
            print("Added admin membership (visible)")

        # 4. Load events (skip ones already present)
        result = await db.execute(select(Event).where(Event.calendar_id == calendar.id))
        existing = {(e.month, e.day, e.title) for e in result.scalars().all()}

        added = 0
        for b in birthdays:
            key = (b["month"], b["day"], b["title"])
            if key in existing:
                continue
            db.add(Event(
                user_id=admin.id,
                calendar_id=calendar.id,
                month=b["month"],
                day=b["day"],
                end_month=b["month"],
                end_day=b["day"],
                title=b["title"],
                color=calendar.color,
            ))
            added += 1

        await db.commit()
        print(f"Added {added} new events ({len(birthdays) - added} already present). Done.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed the 84 Hope birthdays calendar")
    parser.add_argument("--email", default=DEFAULT_EMAIL, help="Admin user's email")
    parser.add_argument("--create-user", action="store_true", help="Create a placeholder admin if none exists")
    args = parser.parse_args()

    asyncio.run(seed(args.email, args.create_user))
