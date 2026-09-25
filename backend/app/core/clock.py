"""User-local time.

Browsers sometimes report legacy IANA names such as "Asia/Calcutta". Slim Docker images ship without those
legacy alias files, so they are mapped to their canonical names here. Unknown zones fall back to India time.
"""
from datetime import datetime, timezone, tzinfo
from zoneinfo import ZoneInfo

DEFAULT_TZ = "Asia/Kolkata"

_ALIASES = {
    "Asia/Calcutta": "Asia/Kolkata",
    "Asia/Katmandu": "Asia/Kathmandu",
    "Asia/Saigon": "Asia/Ho_Chi_Minh",
    "Asia/Rangoon": "Asia/Yangon",
    "US/Eastern": "America/New_York",
    "US/Central": "America/Chicago",
    "US/Mountain": "America/Denver",
    "US/Pacific": "America/Los_Angeles",
}


def canonical_tz(name: str | None) -> str:
    name = (name or "").strip()
    return _ALIASES.get(name, name) or DEFAULT_TZ


def user_tz(name: str | None) -> tzinfo:
    for key in (canonical_tz(name), DEFAULT_TZ):
        try:
            return ZoneInfo(key)
        except Exception:  # noqa: BLE001
            continue
    return timezone.utc


def local_now(name: str | None) -> datetime:
    return datetime.now(user_tz(name))
