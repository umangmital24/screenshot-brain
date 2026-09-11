import logging
import os

from dotenv import load_dotenv

load_dotenv()
logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO").upper())

from app.services.capture_worker import run_forever


if __name__ == "__main__":
    run_forever()
