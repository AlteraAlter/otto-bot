import logging
import os
import sys
from logging.handlers import RotatingFileHandler
from pathlib import Path

LOG_FILE = Path(os.getenv("LOG_FILE", "logs/otto_bot.log"))
if not LOG_FILE.is_absolute():
    LOG_FILE = Path(__file__).resolve().parents[2] / LOG_FILE
LOG_FILE.parent.mkdir(parents=True, exist_ok=True)

LOG_FORMAT = "%(asctime)s | %(levelname)s | %(name)s | %(message)s"
DATE_FORMAT = "%Y-%m-%d %H:%M:%S"


def _resolve_level(level_name: str | None) -> int:
    level = (level_name or "INFO").upper()
    return getattr(logging, level, logging.INFO)


def setup_logging() -> None:
    """Configure application logging for production and local debugging."""
    level = _resolve_level(os.getenv("LOG_LEVEL"))
    formatter = logging.Formatter(LOG_FORMAT, DATE_FORMAT)

    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(formatter)
    console_handler.setLevel(level)

    file_handler = RotatingFileHandler(
        filename=LOG_FILE,
        maxBytes=int(os.getenv("LOG_MAX_BYTES", str(10 * 1024 * 1024))),
        backupCount=int(os.getenv("LOG_BACKUP_COUNT", "5")),
        encoding="utf-8",
    )
    file_handler.setFormatter(formatter)
    file_handler.setLevel(level)

    root_logger = logging.getLogger()
    root_logger.handlers.clear()
    root_logger.setLevel(level)
    root_logger.addHandler(console_handler)
    root_logger.addHandler(file_handler)

    logging.getLogger("httpx").setLevel(os.getenv("HTTPX_LOG_LEVEL", "WARNING"))
    logging.getLogger("httpcore").setLevel(os.getenv("HTTPX_LOG_LEVEL", "WARNING"))
    logging.getLogger("sqlalchemy.engine").setLevel(
        os.getenv("SQLALCHEMY_LOG_LEVEL", "WARNING")
    )


setup_logging()
