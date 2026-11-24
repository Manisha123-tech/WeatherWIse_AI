"""User preferences and saved locations scoped to the authenticated user."""
from database.db import get_db
from services import cache_service, open_meteo
from utils.responses import ApiError

TEMP_UNITS = {"celsius", "fahrenheit"}
WIND_UNITS = {"kmh", "mph"}
COMFORT_PREFS = {"normal", "cold_sensitive", "heat_sensitive"}


def get_preferences(user_id):
    db = get_db()
    row = db.execute("SELECT * FROM preferences WHERE user_id = ?", (user_id,)).fetchone()
    if row is None:
        db.execute("INSERT INTO preferences (user_id) VALUES (?)", (user_id,))
        db.commit()
        row = db.execute("SELECT * FROM preferences WHERE user_id = ?", (user_id,)).fetchone()
    data = dict(row)
    data["notifications_on"] = bool(data["notifications_on"])
    return data


def update_preferences(user_id, body):
    if not isinstance(body, dict):
        raise ApiError("INVALID_REQUEST", "JSON body is required.", 400)

    current = get_preferences(user_id)
    temp_unit = current["temperature_unit"]
    wind_unit = current["wind_speed_unit"]
    notifications = current["notifications_on"]
    comfort = current["comfort_preference"]

    if "temperature_unit" in body and body["temperature_unit"] is not None:
        val = str(body["temperature_unit"]).strip().lower()
        if val not in TEMP_UNITS:
            raise ApiError("INVALID_REQUEST", "'temperature_unit' must be 'celsius' or 'fahrenheit'.", 400)
        temp_unit = val

    if "wind_speed_unit" in body and body["wind_speed_unit"] is not None:
        val = str(body["wind_speed_unit"]).strip().lower()
        if val not in WIND_UNITS:
            raise ApiError("INVALID_REQUEST", "'wind_speed_unit' must be 'kmh' or 'mph'.", 400)
        wind_unit = val

    if "notifications_on" in body and body["notifications_on"] is not None:
        raw_notif = body["notifications_on"]
        if not isinstance(raw_notif, bool):
            raise ApiError("INVALID_REQUEST", "'notifications_on' must be true or false.", 400)
        notifications = raw_notif

    if "comfort_preference" in body and body["comfort_preference"] is not None:
        val = str(body["comfort_preference"]).strip().lower()
        if val not in COMFORT_PREFS:
            raise ApiError(
                "INVALID_REQUEST",
                "'comfort_preference' must be 'normal', 'cold_sensitive', or 'heat_sensitive'.",
                400,
            )
        comfort = val

    updated_at = cache_service.to_iso(cache_service.utc_now())
    db = get_db()
    db.execute(
        """
        UPDATE preferences
        SET temperature_unit = ?, wind_speed_unit = ?, notifications_on = ?,
            comfort_preference = ?, updated_at = ?
        WHERE user_id = ?
        """,
        (temp_unit, wind_unit, int(notifications), comfort, updated_at, user_id),
    )
    db.commit()
    return get_preferences(user_id)


def list_saved_locations(user_id):
    rows = get_db().execute(
        "SELECT * FROM saved_locations WHERE user_id = ? ORDER BY created_at DESC, id DESC",
        (user_id,),
    ).fetchall()
    return [dict(r) for r in rows]


def add_saved_location(user_id, body):
    if not isinstance(body, dict):
        raise ApiError("INVALID_REQUEST", "JSON body is required.", 400)

    city = body.get("city")
    name = body.get("name")
    lat = body.get("latitude")
    lon = body.get("longitude")
    country = body.get("country")
    admin1 = body.get("admin1")

    if isinstance(city, str) and city.strip() and (lat is None or lon is None):
        loc = open_meteo.search_locations(city.strip(), 1)[0]
        name = name or loc["name"]
        lat = loc["latitude"]
        lon = loc["longitude"]
        country = country or loc.get("country")
        admin1 = admin1 or loc.get("admin1")
    else:
        lat, lon = open_meteo.parse_coordinates(lat, lon)
        if not isinstance(name, str) or not name.strip():
            raise ApiError("INVALID_REQUEST", "'name' is required when saving coordinates.", 400)
        name = name.strip()

    db = get_db()
    cur = db.execute(
        """
        INSERT INTO saved_locations (user_id, name, country, admin1, latitude, longitude)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (user_id, name[:80], country, admin1, lat, lon),
    )
    db.commit()
    row = db.execute("SELECT * FROM saved_locations WHERE id = ?", (cur.lastrowid,)).fetchone()
    return dict(row)


def delete_saved_location(user_id, location_id):
    db = get_db()
    row = db.execute(
        "SELECT id, user_id FROM saved_locations WHERE id = ?",
        (location_id,),
    ).fetchone()
    if row is None or row["user_id"] != user_id:
        raise ApiError("NOT_FOUND", "Saved location not found.", 404)
    db.execute("DELETE FROM saved_locations WHERE id = ? AND user_id = ?", (location_id, user_id))
    db.commit()
    return {"deleted_id": location_id}
