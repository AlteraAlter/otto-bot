"""ORM model for raw paginated product rows fetched from Afterbuy JV lister."""

from datetime import datetime

from sqlalchemy import DateTime, Integer, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class JVLister(Base):
    """Store one raw Afterbuy JV lister product payload per upstream product id."""

    __tablename__ = "jv_lister"
    __table_args__ = (
        UniqueConstraint(
            "account",
            "remote_product_id",
            name="uq_jv_lister_account_remote_product_id",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    account: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    remote_product_id: Mapped[str] = mapped_column(String(100), nullable=False)
    dataset: Mapped[str] = mapped_column(String(50), nullable=False, default="lister")
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False)
    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False),
        nullable=False,
        server_default=func.now(),
    )
