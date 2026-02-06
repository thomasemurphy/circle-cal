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
