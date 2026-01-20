from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Text, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid

from .database import Base


def generate_uuid():
    return str(uuid.uuid4())


class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    google_id = Column(String(255), unique=True, nullable=False)
    email = Column(String(255), nullable=False)
    name = Column(String(255))
    picture_url = Column(Text)
    created_at = Column(DateTime, server_default=func.now())

    # Birthday fields (optional)
    birthday_month = Column(Integer, nullable=True)  # 1-12
    birthday_day = Column(Integer, nullable=True)    # 1-31

    events = relationship("Event", back_populates="user", cascade="all, delete-orphan")

    # Friendship relationships (for future mutual birthday sharing)
    sent_friend_requests = relationship(
        "Friendship",
        foreign_keys="Friendship.requester_id",
        back_populates="requester",
        cascade="all, delete-orphan"
    )
    received_friend_requests = relationship(
        "Friendship",
        foreign_keys="Friendship.addressee_id",
        back_populates="addressee",
        cascade="all, delete-orphan"
    )


class Event(Base):
    __tablename__ = "events"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    month = Column(Integer, nullable=False)
    day = Column(Integer, nullable=False)
    end_month = Column(Integer, nullable=True)  # For multi-day events
    end_day = Column(Integer, nullable=True)    # For multi-day events
    title = Column(String(500), nullable=False)
    color = Column(String(7), nullable=True, default="#ff6360")  # Hex color
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    user = relationship("User", back_populates="events")


class Friendship(Base):
    """Mutual friend connection for birthday sharing (future feature)"""
    __tablename__ = "friendships"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    requester_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    addressee_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    status = Column(String(20), nullable=False, default="pending")  # pending, accepted, declined
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    requester = relationship("User", foreign_keys=[requester_id], back_populates="sent_friend_requests")
    addressee = relationship("User", foreign_keys=[addressee_id], back_populates="received_friend_requests")

    __table_args__ = (
        UniqueConstraint('requester_id', 'addressee_id', name='unique_friendship_request'),
    )


class PendingInvitation(Base):
    """Stores friend invitations for users who haven't signed up yet"""
    __tablename__ = "pending_invitations"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    inviter_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    invited_email = Column(String(255), nullable=False)
    created_at = Column(DateTime, server_default=func.now())

    inviter = relationship("User")

    __table_args__ = (
        UniqueConstraint('inviter_id', 'invited_email', name='unique_pending_invitation'),
    )
