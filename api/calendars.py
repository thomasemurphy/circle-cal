from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List

from .database import get_db
from .models import User, Calendar, CalendarMembership, Event
from .schemas import (
    CalendarResponse,
    CalendarUpdate,
    CalendarVisibilityUpdate,
    CalendarMemberAdd,
    CalendarMemberResponse,
    CalendarMemberAddResponse,
    EventCreate,
    EventUpdate,
    EventResponse,
)
from .auth import require_user

router = APIRouter(prefix="/api/calendars", tags=["calendars"])


async def _get_membership(db: AsyncSession, calendar_id: str, user_id: str):
    result = await db.execute(
        select(CalendarMembership).where(
            CalendarMembership.calendar_id == calendar_id,
            CalendarMembership.user_id == user_id,
        )
    )
    return result.scalar_one_or_none()


async def _get_calendar_for_member(db: AsyncSession, calendar_id: str, user: User) -> Calendar:
    """Return the calendar if the user can access it, else 404."""
    result = await db.execute(select(Calendar).where(Calendar.id == calendar_id))
    calendar = result.scalar_one_or_none()
    if not calendar:
        raise HTTPException(status_code=404, detail="Calendar not found")
    membership = await _get_membership(db, calendar_id, user.id)
    if not membership and calendar.admin_user_id != user.id:
        raise HTTPException(status_code=404, detail="Calendar not found")
    return calendar


async def _get_calendar_for_admin(db: AsyncSession, calendar_id: str, user: User) -> Calendar:
    """Return the calendar if the user is its admin, else 403/404."""
    result = await db.execute(select(Calendar).where(Calendar.id == calendar_id))
    calendar = result.scalar_one_or_none()
    if not calendar:
        raise HTTPException(status_code=404, detail="Calendar not found")
    if calendar.admin_user_id != user.id:
        raise HTTPException(status_code=403, detail="Only the calendar admin can do that")
    return calendar


@router.get("", response_model=List[CalendarResponse])
async def list_calendars(
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """List all calendars the current user can access (admin or subscriber)."""
    result = await db.execute(
        select(Calendar, CalendarMembership)
        .join(CalendarMembership, CalendarMembership.calendar_id == Calendar.id)
        .where(CalendarMembership.user_id == user.id)
        .order_by(Calendar.name)
    )
    rows = result.all()
    return [
        CalendarResponse(
            id=cal.id,
            name=cal.name,
            color=cal.color,
            is_admin=cal.admin_user_id == user.id,
            is_visible=membership.is_visible,
        )
        for cal, membership in rows
    ]


@router.patch("/{calendar_id}", response_model=CalendarResponse)
async def update_calendar(
    calendar_id: str,
    data: CalendarUpdate,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Admin: rename or recolor a calendar."""
    calendar = await _get_calendar_for_admin(db, calendar_id, user)
    if data.name is not None:
        calendar.name = data.name
    if data.color is not None:
        calendar.color = data.color
    await db.commit()
    await db.refresh(calendar)
    membership = await _get_membership(db, calendar_id, user.id)
    return CalendarResponse(
        id=calendar.id,
        name=calendar.name,
        color=calendar.color,
        is_admin=True,
        is_visible=membership.is_visible if membership else True,
    )


@router.patch("/{calendar_id}/visibility", response_model=CalendarResponse)
async def set_visibility(
    calendar_id: str,
    data: CalendarVisibilityUpdate,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Member: show or hide this calendar's events on their own view."""
    calendar = await _get_calendar_for_member(db, calendar_id, user)
    membership = await _get_membership(db, calendar_id, user.id)
    if not membership:
        raise HTTPException(status_code=404, detail="Calendar not found")
    membership.is_visible = data.is_visible
    await db.commit()
    return CalendarResponse(
        id=calendar.id,
        name=calendar.name,
        color=calendar.color,
        is_admin=calendar.admin_user_id == user.id,
        is_visible=membership.is_visible,
    )


# ---- Members (subscribers) ----

@router.get("/{calendar_id}/members", response_model=List[CalendarMemberResponse])
async def list_members(
    calendar_id: str,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Admin: list subscribers (excludes the admin)."""
    calendar = await _get_calendar_for_admin(db, calendar_id, user)
    result = await db.execute(
        select(CalendarMembership, User)
        .join(User, User.id == CalendarMembership.user_id)
        .where(
            CalendarMembership.calendar_id == calendar_id,
            CalendarMembership.user_id != calendar.admin_user_id,
        )
        .order_by(User.name)
    )
    return [
        CalendarMemberResponse(
            user_id=u.id,
            email=u.email,
            name=u.name,
            picture_url=u.picture_url,
            is_visible=membership.is_visible,
        )
        for membership, u in result.all()
    ]


@router.post("/{calendar_id}/members", response_model=CalendarMemberAddResponse, status_code=201)
async def add_member(
    calendar_id: str,
    data: CalendarMemberAdd,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Admin: add a subscriber directly by email (must be an existing user)."""
    calendar = await _get_calendar_for_admin(db, calendar_id, user)
    email = data.email.lower().strip()

    result = await db.execute(select(User).where(User.email == email))
    target = result.scalar_one_or_none()
    if not target:
        return CalendarMemberAddResponse(
            message="No account found with that email. They need to sign in once before you can add them.",
        )
    if target.id == calendar.admin_user_id:
        raise HTTPException(status_code=400, detail="You're already the admin of this calendar")

    existing = await _get_membership(db, calendar_id, target.id)
    if existing:
        raise HTTPException(status_code=400, detail="That person is already subscribed")

    membership = CalendarMembership(
        calendar_id=calendar_id,
        user_id=target.id,
        is_visible=False,
    )
    db.add(membership)
    await db.commit()
    return CalendarMemberAddResponse(
        message=f"Added {target.name or target.email}",
        member=CalendarMemberResponse(
            user_id=target.id,
            email=target.email,
            name=target.name,
            picture_url=target.picture_url,
            is_visible=False,
        ),
    )


@router.delete("/{calendar_id}/members/{member_user_id}", status_code=204)
async def remove_member(
    calendar_id: str,
    member_user_id: str,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Admin: remove a subscriber."""
    calendar = await _get_calendar_for_admin(db, calendar_id, user)
    if member_user_id == calendar.admin_user_id:
        raise HTTPException(status_code=400, detail="Cannot remove the admin")
    membership = await _get_membership(db, calendar_id, member_user_id)
    if not membership:
        raise HTTPException(status_code=404, detail="Subscriber not found")
    await db.delete(membership)
    await db.commit()


# ---- Calendar events ----

@router.get("/{calendar_id}/events", response_model=List[EventResponse])
async def list_calendar_events(
    calendar_id: str,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Member: list events on this calendar."""
    await _get_calendar_for_member(db, calendar_id, user)
    result = await db.execute(
        select(Event)
        .where(Event.calendar_id == calendar_id)
        .order_by(Event.month, Event.day)
    )
    return result.scalars().all()


@router.post("/{calendar_id}/events", response_model=EventResponse, status_code=201)
async def create_calendar_event(
    calendar_id: str,
    event_data: EventCreate,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Admin: add an event to this calendar."""
    calendar = await _get_calendar_for_admin(db, calendar_id, user)
    end_month = event_data.end_month if event_data.end_month is not None else event_data.month
    end_day = event_data.end_day if event_data.end_day is not None else event_data.day

    event = Event(
        user_id=calendar.admin_user_id,
        calendar_id=calendar_id,
        month=event_data.month,
        day=event_data.day,
        end_month=end_month,
        end_day=end_day,
        title=event_data.title,
        color=calendar.color,
    )
    db.add(event)
    await db.commit()
    await db.refresh(event)
    return event


@router.put("/{calendar_id}/events/{event_id}", response_model=EventResponse)
async def update_calendar_event(
    calendar_id: str,
    event_id: str,
    event_data: EventUpdate,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Admin: update an event on this calendar."""
    await _get_calendar_for_admin(db, calendar_id, user)
    result = await db.execute(
        select(Event).where(Event.id == event_id, Event.calendar_id == calendar_id)
    )
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    if event_data.month is not None:
        event.month = event_data.month
    if event_data.day is not None:
        event.day = event_data.day
    if "end_month" in event_data.model_fields_set:
        event.end_month = event_data.end_month if event_data.end_month is not None else event.month
    if "end_day" in event_data.model_fields_set:
        event.end_day = event_data.end_day if event_data.end_day is not None else event.day
    if event_data.title is not None:
        event.title = event_data.title

    await db.commit()
    await db.refresh(event)
    return event


@router.delete("/{calendar_id}/events/{event_id}", status_code=204)
async def delete_calendar_event(
    calendar_id: str,
    event_id: str,
    user: User = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Admin: delete an event from this calendar."""
    await _get_calendar_for_admin(db, calendar_id, user)
    result = await db.execute(
        select(Event).where(Event.id == event_id, Event.calendar_id == calendar_id)
    )
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    await db.delete(event)
    await db.commit()
