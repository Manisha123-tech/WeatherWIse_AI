"""SQLite-backed response cache with freshness and stale fallback support."""
from datetime import datetime, timedelta, timezone
import json

from flask import has_app_context

from database.db import get_db


def utc_now():
    return datetime.now(timezone.utc)


def to_iso(dt):
    return dt.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def parse_iso(text):
    if not isinstance(text, str) or not text:
        return None
    normalized = text.strip()
    if normalized.endswith("Z"):
        normalized = normalized[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(normalized)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def get_cached(cache_key):
    """Return (payload, meta) if present, else (None, None)."""
    if not has_app_context():
        return None, None
    try:
        row = get_db().execute(
            "SELECT payload, created_at, expires_at FROM cache_records WHERE cache_key = ?",
            (cache_key,),
        ).fetchone()
    except Exception:
        return None, None
    if row is None:
        return None, None
    try:
        payload = json.loads(row["payload"])
    except (TypeError, ValueError):
        return None, None

    expires_dt = parse_iso(row["expires_at"])
    is_stale = expires_dt is None or utc_now() >= expires_dt
    return payload, {
        "cached": True,
        "stale": is_stale,
        "updated_at": row["created_at"],
        "expires_at": row["expires_at"],
    }


def set_cached(cache_key, location_params, payload, ttl_seconds):
    """Store a JSON payload in cache_records and return freshness metadata."""
    now = utc_now()
    expires = now + timedelta(seconds=max(1, int(ttl_seconds)))
    created_at = to_iso(now)
    expires_at = to_iso(expires)

    if has_app_context():
        try:
            db = get_db()
            db.execute(
                """
                INSERT INTO cache_records (cache_key, location_params, payload, created_at, expires_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(cache_key) DO UPDATE SET
                    location_params = excluded.location_params,
                    payload = excluded.payload,
                    created_at = excluded.created_at,
                    expires_at = excluded.expires_at
                """,
                (cache_key, json.dumps(location_params, sort_keys=True),
                 json.dumps(payload), created_at, expires_at),
            )
            db.commit()
        except Exception:
            pass

    return {
        "cached": False,
        "stale": False,
        "updated_at": created_at,
        "expires_at": expires_at,
    }
