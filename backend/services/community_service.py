"""Community weather reports with validation, moderation, verification and expiry."""
from datetime import timedelta
import math
import os

from flask import current_app
from werkzeug.utils import secure_filename

from database.db import get_db
from services import cache_service, open_meteo
from utils.responses import ApiError

ALLOWED_CATEGORIES = {
    "rain",
    "heavy_rain",
    "thunderstorm",
    "flooding",
    "waterlogging",
    "strong_wind",
    "fog",
    "heat",
    "cold",
    "clear",
}

MODERATION_STATUSES = {"pending", "approved", "rejected", "archived"}
VERIFICATION_STATUSES = {"unverified", "verified", "disputed"}
ALLOWED_PHOTO_EXTS = {".jpg", ".jpeg", ".png", ".webp"}


def _haversine_km(lat1, lon1, lat2, lon2):
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def _validate_photo_reference(photo_ref):
    if photo_ref is None or (isinstance(photo_ref, str) and photo_ref.strip() == ""):
        return None
    if not isinstance(photo_ref, str):
        raise ApiError("INVALID_REQUEST", "'photo_reference' must be a filename string.", 400)
    raw_name = photo_ref.strip()
    if len(raw_name) > 120 or "/" in raw_name or "\\" in raw_name:
        raise ApiError("INVALID_REQUEST", "Invalid 'photo_reference' filename.", 400)
    safe = secure_filename(raw_name)
    _, ext = os.path.splitext(safe.lower())
    if not safe or ext not in ALLOWED_PHOTO_EXTS:
        raise ApiError(
            "INVALID_REQUEST",
            "'photo_reference' must be an image file (.jpg, .jpeg, .png, .webp).",
            400,
        )
    return safe


def _format_report(row):
    item = dict(row)
    expires_dt = cache_service.parse_iso(item.get("expires_at"))
    item["is_expired"] = bool(expires_dt is not None and cache_service.utc_now() >= expires_dt)
    return item


def create_report(body, user=None):
    if not isinstance(body, dict):
        raise ApiError("INVALID_REQUEST", "JSON body is required.", 400)

    raw_category = body.get("category") or body.get("condition")
    if not isinstance(raw_category, str) or not raw_category.strip():
        raise ApiError("INVALID_REQUEST", "'category' is required.", 400)
    category = raw_category.strip().lower().replace(" ", "_")
    if category not in ALLOWED_CATEGORIES:
        raise ApiError(
            "INVALID_REQUEST",
            "Unsupported report category. Allowed: " + ", ".join(sorted(ALLOWED_CATEGORIES)),
            400,
        )

    description = body.get("description")
    if not isinstance(description, str) or len(description.strip()) < 5 or len(description.strip()) > 500:
        raise ApiError(
            "INVALID_REQUEST",
            "'description' must be between 5 and 500 characters.",
            400,
        )

    city = body.get("city")
    lat = body.get("latitude")
    lon = body.get("longitude")
    if lat is not None and lon is not None:
        latitude, longitude = open_meteo.parse_coordinates(lat, lon)
        location_name = (body.get("location_name") or city or f"{latitude:.2f}, {longitude:.2f}")
    elif isinstance(city, str) and city.strip():
        loc = open_meteo.search_locations(city.strip(), 1)[0]
        latitude, longitude = loc["latitude"], loc["longitude"]
        location_name = loc.get("display_name") or loc.get("name")
    else:
        raise ApiError("INVALID_REQUEST", "Provide 'latitude' and 'longitude', or 'city'.", 400)

    photo_ref = _validate_photo_reference(body.get("photo_reference"))

    default_hours = int(current_app.config.get("REPORT_EXPIRY_HOURS", 24))
    expiry_hours = body.get("expires_in_hours", default_hours)
    if isinstance(expiry_hours, bool) or not isinstance(expiry_hours, int) or not (1 <= expiry_hours <= 168):
        raise ApiError("INVALID_REQUEST", "'expires_in_hours' must be an integer between 1 and 168.", 400)

    now = cache_service.utc_now()
    created_at = cache_service.to_iso(now)
    expires_at = cache_service.to_iso(now + timedelta(hours=expiry_hours))

    user_id = user["id"] if user else None
    reporter_name = user["username"] if user else str(body.get("reporter_name") or "Anonymous").strip()[:40] or "Anonymous"

    db = get_db()
    cur = db.execute(
        """
        INSERT INTO community_reports (
            user_id, reporter_name, location_name, latitude, longitude,
            category, condition, description, photo_reference,
            moderation_status, verification_status, expires_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'unverified', ?, ?, ?)
        """,
        (
            user_id,
            reporter_name,
            str(location_name),
            latitude,
            longitude,
            category,
            category,
            description.strip(),
            photo_ref,
            expires_at,
            created_at,
            created_at,
        ),
    )
    db.commit()
    row = db.execute("SELECT * FROM community_reports WHERE id = ?", (cur.lastrowid,)).fetchone()
    return _format_report(row)


def list_reports(
    status="approved",
    verification_status=None,
    category=None,
    include_expired=False,
    latitude=None,
    longitude=None,
    radius_km=50.0,
):
    status_norm = (status or "approved").strip().lower()
    if status_norm != "all" and status_norm not in MODERATION_STATUSES:
        raise ApiError("INVALID_REQUEST", "Invalid moderation status filter.", 400)

    clauses = []
    params = []

    if status_norm != "all":
        clauses.append("moderation_status = ?")
        params.append(status_norm)

    if verification_status:
        v_norm = verification_status.strip().lower()
        if v_norm not in VERIFICATION_STATUSES:
            raise ApiError("INVALID_REQUEST", "Invalid verification_status filter.", 400)
        clauses.append("verification_status = ?")
        params.append(v_norm)

    if category:
        c_norm = category.strip().lower().replace(" ", "_")
        if c_norm not in ALLOWED_CATEGORIES:
            raise ApiError("INVALID_REQUEST", "Invalid category filter.", 400)
        clauses.append("category = ?")
        params.append(c_norm)

    sql = "SELECT * FROM community_reports"
    if clauses:
        sql += " WHERE " + " AND ".join(clauses)
    sql += " ORDER BY created_at DESC, id DESC"

    rows = get_db().execute(sql, params).fetchall()
    items = [_format_report(r) for r in rows]

    if not include_expired:
        items = [r for r in items if not r["is_expired"]]

    if latitude is not None and longitude is not None:
        lat, lon = open_meteo.parse_coordinates(latitude, longitude)
        try:
            rad = float(radius_km)
        except (TypeError, ValueError):
            raise ApiError("INVALID_REQUEST", "'radius_km' must be a number.", 400)
        if not (0 < rad <= 2000):
            raise ApiError("INVALID_REQUEST", "'radius_km' must be between 0 and 2000.", 400)
        items = [
            r for r in items
            if _haversine_km(lat, lon, r["latitude"], r["longitude"]) <= rad
        ]

    return items


def moderate_report(report_id, body):
    if not isinstance(body, dict):
        raise ApiError("INVALID_REQUEST", "JSON body is required.", 400)

    db = get_db()
    existing = db.execute("SELECT * FROM community_reports WHERE id = ?", (report_id,)).fetchone()
    if existing is None:
        raise ApiError("NOT_FOUND", "Community report not found.", 404)

    mod_status = existing["moderation_status"]
    ver_status = existing["verification_status"]
    note = existing["moderator_note"]

    if "moderation_status" in body and body["moderation_status"] is not None:
        candidate = str(body["moderation_status"]).strip().lower()
        if candidate not in MODERATION_STATUSES:
            raise ApiError("INVALID_REQUEST", "Invalid 'moderation_status'.", 400)
        mod_status = candidate

    if "verification_status" in body and body["verification_status"] is not None:
        candidate = str(body["verification_status"]).strip().lower()
        if candidate not in VERIFICATION_STATUSES:
            raise ApiError("INVALID_REQUEST", "Invalid 'verification_status'.", 400)
        ver_status = candidate

    if "moderator_note" in body:
        raw_note = body["moderator_note"]
        if raw_note is not None and not isinstance(raw_note, str):
            raise ApiError("INVALID_REQUEST", "'moderator_note' must be text.", 400)
        note = raw_note.strip()[:300] if raw_note else None

    updated_at = cache_service.to_iso(cache_service.utc_now())
    db.execute(
        """
        UPDATE community_reports
        SET moderation_status = ?, verification_status = ?, moderator_note = ?, updated_at = ?
        WHERE id = ?
        """,
        (mod_status, ver_status, note, updated_at, report_id),
    )
    db.commit()
    row = db.execute("SELECT * FROM community_reports WHERE id = ?", (report_id,)).fetchone()
    return _format_report(row)


def archive_expired_reports():
    now_iso = cache_service.to_iso(cache_service.utc_now())
    db = get_db()
    rows = db.execute(
        "SELECT id, expires_at FROM community_reports WHERE moderation_status != 'archived'"
    ).fetchall()
    now_dt = cache_service.utc_now()
    expired_ids = []
    for row in rows:
        exp_dt = cache_service.parse_iso(row["expires_at"])
        if exp_dt is not None and now_dt >= exp_dt:
            expired_ids.append(row["id"])

    for rid in expired_ids:
        db.execute(
            "UPDATE community_reports SET moderation_status = 'archived', updated_at = ? WHERE id = ?",
            (now_iso, rid),
        )
    db.commit()
    return {"archived_count": len(expired_ids), "archived_ids": expired_ids}


def delete_report(report_id, user=None):
    db = get_db()
    row = db.execute("SELECT * FROM community_reports WHERE id = ?", (report_id,)).fetchone()
    if row is None:
        raise ApiError("NOT_FOUND", "Community report not found.", 404)
    if row["user_id"] is not None:
        if user is None or user["id"] != row["user_id"]:
            raise ApiError("FORBIDDEN", "You can only delete your own community reports.", 403)
    db.execute("DELETE FROM community_reports WHERE id = ?", (report_id,))
    db.commit()
    return {"deleted_id": report_id}
