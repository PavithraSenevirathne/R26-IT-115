from sqlalchemy import Column, String, DateTime
import datetime
import uuid
from database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    phone = Column(String, unique=True, index=True, nullable=False)
    pin_hash = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)