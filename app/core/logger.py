import logging

from pathlib import Path
from logging.handlers import RotatingFileHandler

LOG_DIR = (Path(__file__).resolve().parents[2] / "logs" / "product_service.log")
LOG_DIR.parent.mkdir(parents=True, exist_ok=True)

formatter = logging.Formatter(
    "%(asctime)s | "
    "%(name)s | "
    "%(levelname)s | "
    "%(message)s"
)
    

file_handler = RotatingFileHandler(
    filename=LOG_DIR,
    maxBytes=5*1024*1024,
    backupCount=5,
    encoding="utf-8"
)

file_handler.setFormatter(formatter)

logging.basicConfig(
    level=logging.DEBUG,
    handlers=[file_handler]
)


if __name__ == "__main__":
    from pathlib import Path
    print(Path(__file__).resolve().parents[1] / "logs" / "product_service.log")
    