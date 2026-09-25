"""Block until Postgres accepts connections (used by the Docker entrypoint)."""
import sys
import time

from sqlalchemy import text

from app.db.session import engine


def wait(timeout: int = 60) -> None:
    start = time.time()
    while True:
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            print("Database is ready.")
            return
        except Exception as exc:  # noqa: BLE001
            if time.time() - start > timeout:
                print(f"Database not reachable after {timeout}s: {exc}")
                sys.exit(1)
            time.sleep(1)


if __name__ == "__main__":
    wait()
