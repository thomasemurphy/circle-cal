from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional


class UserResponse(BaseModel):
    id: str
    email: str
    name: Optional[str]
    picture_url: Optional[str]
    birthday_month: Optional[int] = None
    birthday_day: Optional[int] = None

    class Config:
        from_attributes = True


class UserUpdate(BaseModel):
    birthday_month: Optional[int] = Field(None, ge=1, le=12)
    birthday_day: Optional[int] = Field(None, ge=1, le=31)


class EventCreate(BaseModel):
    month: int = Field(ge=1, le=12)
    day: int = Field(ge=1, le=31)
    end_month: Optional[int] = Field(None, ge=1, le=12)
    end_day: Optional[int] = Field(None, ge=1, le=31)
    title: str = Field(min_length=1, max_length=500)
    color: Optional[str] = Field(None, max_length=7)
    hidden: Optional[bool] = False


class EventUpdate(BaseModel):
    month: Optional[int] = Field(None, ge=1, le=12)
    day: Optional[int] = Field(None, ge=1, le=31)
    end_month: Optional[int] = Field(None, ge=1, le=12)
    end_day: Optional[int] = Field(None, ge=1, le=31)
    title: Optional[str] = Field(None, min_length=1, max_length=500)
    color: Optional[str] = Field(None, max_length=7)
    hidden: Optional[bool] = None


class EventResponse(BaseModel):
    id: str
    month: int
    day: int
    end_month: int
    end_day: int
    title: str
    color: Optional[str]
    hidden: bool
    # Per-user color override for this event (only set for calendar events).
    my_color: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# Friend-related schemas
class FriendUserResponse(BaseModel):
    """User info for friend display"""
    id: str
    email: str
    name: Optional[str]
    picture_url: Optional[str]
    birthday_month: Optional[int] = None
    birthday_day: Optional[int] = None

    class Config:
        from_attributes = True


class FriendRequestCreate(BaseModel):
    email: str = Field(min_length=1, max_length=255)


class FriendRequestAction(BaseModel):
    accept: bool


class FriendRequestResponse(BaseModel):
    id: str
    requester: FriendUserResponse
    status: str
    created_at: datetime

    class Config:
        from_attributes = True


class FriendshipResponse(BaseModel):
    id: str
    friend: FriendUserResponse
    created_at: datetime

    class Config:
        from_attributes = True


class FriendRequestSentResponse(BaseModel):
    message: str
    invited: bool = False


# Calendar (shared event collection) schemas
class CalendarResponse(BaseModel):
    """A calendar the current user can access, with their role and visibility."""
    id: str
    name: str
    color: str
    is_admin: bool
    is_visible: bool
    # Per-user override for this calendar's color (None = use the admin's color).
    color_override: Optional[str] = None

    class Config:
        from_attributes = True


class ColorOverrideUpdate(BaseModel):
    """Set a per-user color override. Passing color=None clears the override."""
    color: Optional[str] = Field(None, max_length=7)


class CalendarUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    color: Optional[str] = Field(None, max_length=7)


class CalendarVisibilityUpdate(BaseModel):
    is_visible: bool


class CalendarMemberAdd(BaseModel):
    email: str = Field(min_length=1, max_length=255)


class CalendarMemberResponse(BaseModel):
    """A subscriber of a calendar (excludes the admin).

    `status` is "active" for real members and "pending" for invited emails
    that don't have an account yet. Pending rows have `user_id` set to the
    string "pending:<email>" so the frontend can identify+revoke them
    uniformly with active members.
    """
    user_id: str
    email: str
    name: Optional[str]
    picture_url: Optional[str]
    is_visible: bool
    status: str = "active"

    class Config:
        from_attributes = True


class CalendarMemberAddResponse(BaseModel):
    message: str
    member: Optional[CalendarMemberResponse] = None
