"""ORM model for rows imported from account-specific OTTO XLSX exports."""

from datetime import datetime

from sqlalchemy import (
    BigInteger,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class OttoXlsxImportRow(Base):
    """One raw OTTO marketplace XLSX row imported for JV or XL matching."""

    __tablename__ = "otto_xlsx_import_rows"
    __table_args__ = (
        UniqueConstraint(
            "account",
            "source_file",
            "source_row",
            name="uq_otto_xlsx_import_account_file_row",
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    account: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    source_file: Mapped[str] = mapped_column(Text, nullable=False)
    source_row: Mapped[int] = mapped_column(Integer, nullable=False)
    product_reference: Mapped[str | None] = mapped_column(String, nullable=True)
    sku: Mapped[str | None] = mapped_column(String, nullable=True, index=True)
    ean: Mapped[str | None] = mapped_column(String, nullable=True, index=True)
    moin: Mapped[str | None] = mapped_column(String, nullable=True, index=True)
    product_category: Mapped[str | None] = mapped_column(
        String, nullable=True, index=True
    )
    brand_id: Mapped[str | None] = mapped_column(String, nullable=True)
    brand: Mapped[str | None] = mapped_column(String, nullable=True)
    price: Mapped[float | None] = mapped_column(Float, nullable=True)
    recommended_retail_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    marketplace_status: Mapped[str | None] = mapped_column(String, nullable=True)
    active_status: Mapped[str | None] = mapped_column(String, nullable=True)
    otto_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    url_product_name: Mapped[str | None] = mapped_column(Text, nullable=True)
    product_name: Mapped[str | None] = mapped_column(Text, nullable=True)
    name_source: Mapped[str | None] = mapped_column(String(50), nullable=True)
    normalized_name: Mapped[str | None] = mapped_column(Text, nullable=True, index=True)
    raw_payload: Mapped[dict] = mapped_column(JSONB, nullable=False)
    imported_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )


class OttoXlsxEanMapping(Base):
    """Materialized JV-to-XL EAN mapping attempt built from imported XLSX names."""

    __tablename__ = "otto_xlsx_ean_mappings"
    __table_args__ = (
        UniqueConstraint(
            "source_account",
            "target_account",
            "source_ean",
            name="uq_otto_xlsx_ean_mapping_source_target_ean",
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    source_account: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    target_account: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    source_import_row_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("otto_xlsx_import_rows.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    target_import_row_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("otto_xlsx_import_rows.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    source_ean: Mapped[str] = mapped_column(String, nullable=False, index=True)
    target_ean: Mapped[str | None] = mapped_column(String, nullable=True, index=True)
    source_product_category: Mapped[str | None] = mapped_column(String, nullable=True)
    target_product_category: Mapped[str | None] = mapped_column(String, nullable=True)
    source_name: Mapped[str | None] = mapped_column(Text, nullable=True)
    target_name: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_normalized_name: Mapped[str | None] = mapped_column(Text, nullable=True)
    target_normalized_name: Mapped[str | None] = mapped_column(Text, nullable=True)
    score: Mapped[float | None] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    strategy: Mapped[str] = mapped_column(String(50), nullable=False)
    candidate_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    match_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )


class OttoXlsxNameMapping(Base):
    """Materialized JV-to-XL mapping by normalized product name."""

    __tablename__ = "otto_xlsx_name_mappings"
    __table_args__ = (
        UniqueConstraint(
            "source_account",
            "target_account",
            "source_normalized_name",
            name="uq_otto_xlsx_name_mapping_source_target_name",
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    source_account: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    target_account: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    source_import_row_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("otto_xlsx_import_rows.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    target_import_row_id: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("otto_xlsx_import_rows.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    source_ean: Mapped[str | None] = mapped_column(String, nullable=True, index=True)
    target_ean: Mapped[str | None] = mapped_column(String, nullable=True, index=True)
    source_product_category: Mapped[str | None] = mapped_column(String, nullable=True)
    target_product_category: Mapped[str | None] = mapped_column(String, nullable=True)
    source_name: Mapped[str] = mapped_column(Text, nullable=False)
    target_name: Mapped[str] = mapped_column(Text, nullable=False)
    source_normalized_name: Mapped[str] = mapped_column(
        Text, nullable=False, index=True
    )
    target_normalized_name: Mapped[str] = mapped_column(
        Text, nullable=False, index=True
    )
    source_row_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    target_row_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    score: Mapped[float] = mapped_column(Float, nullable=False)
    strategy: Mapped[str] = mapped_column(String(50), nullable=False)
    candidate_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
