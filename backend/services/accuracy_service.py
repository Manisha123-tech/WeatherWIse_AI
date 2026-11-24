"""Forecast snapshot storage, observations and auditable accuracy metrics."""
from datetime import datetime, timezone
import json
import math

from flask import current_app

from database.db import get_db
from services import cache_service, open_meteo, weather_formatter
from utils.responses import ApiError


def make_location_key(latitude, longitude):
    return f"{round(float(latitude), 2):.2f},{round(float(longitude), 2):.2f}"


def _parse_number(value, name, required=False):
    if value is None:
        if required:
            raise ApiError("INVALID_REQUEST", f"'{name}' is required.", 400)
        return None
    if isinstance(value, bool):
        raise ApiError("INVALID_REQUEST", f"'{name}' must be a number.", 400)
    try:
        num = float(value)
    except (TypeError, ValueError):
        raise ApiError("INVALID_REQUEST", f"'{name}' must be a number.", 400)
    if not math.isfinite(num):
        raise ApiError("INVALID_REQUEST", f"'{name}' must be a finite number.", 400)
    return num


def _normalize_hour_key(time_text):
    if not isinstance(time_text, str) or len(time_text.strip()) < 13:
        raise ApiError(
            "INVALID_REQUEST",
            "Timestamp must be ISO format like '2026-11-25T14:00'.",
            400,
        )
    text = time_text.strip()
    dt = cache_service.parse_iso(text)
    if dt is not None:
        return dt.strftime("%Y-%m-%dT%H:00"), cache_service.to_iso(dt)
    # Fallback for YYYY-MM-DDTHH:MM without timezone
    try:
        parsed = datetime.strptime(text[:16], "%Y-%m-%dT%H:%M")
    except ValueError:
        raise ApiError(
            "INVALID_REQUEST",
            "Timestamp must be ISO format like '2026-11-25T14:00'.",
            400,
        )
    return parsed.strftime("%Y-%m-%dT%H:00"), text


def _resolve_target(body):
    city = body.get("city")
    lat = body.get("latitude")
    lon = body.get("longitude")
    if isinstance(city, str) and city.strip():
        loc = open_meteo.search_locations(city.strip(), 1)[0]
        return loc["latitude"], loc["longitude"], loc.get("display_name") or loc.get("name")
    if lat is not None and lon is not None:
        la, lo = open_meteo.parse_coordinates(lat, lon)
        return la, lo, body.get("location_name") or f"{la:.2f}, {lo:.2f}"
    raise ApiError("INVALID_REQUEST", "Provide 'city' or both 'latitude' and 'longitude'.", 400)


def create_snapshot(body):
    """Save either a manually supplied snapshot or live forecast snapshots from Open-Meteo."""
    if not isinstance(body, dict):
        raise ApiError("INVALID_REQUEST", "JSON body is required.", 400)

    lat, lon, loc_name = _resolve_target(body)
    location_key = make_location_key(lat, lon)
    fetched_at = cache_service.to_iso(cache_service.utc_now())
    db = get_db()

    # Manual snapshot entry
    if body.get("valid_time") is not None and body.get("predicted_temp") is not None:
        _, valid_iso = _normalize_hour_key(body.get("valid_time"))
        pred_temp = _parse_number(body.get("predicted_temp"), "predicted_temp", required=True)
        pred_prob = _parse_number(body.get("predicted_precip_prob"), "predicted_precip_prob")
        pred_mm = _parse_number(body.get("predicted_precip_mm"), "predicted_precip_mm")
        pred_wind = _parse_number(body.get("predicted_wind_kmh"), "predicted_wind_kmh")
        horizon = body.get("horizon_hours")
        if horizon is not None:
            if isinstance(horizon, bool) or not isinstance(horizon, int) or horizon < 0:
                raise ApiError("INVALID_REQUEST", "'horizon_hours' must be a non-negative integer.", 400)
        source = str(body.get("source") or "open-meteo")

        cur = db.execute(
            """
            INSERT INTO forecast_snapshots (
                location_key, location_name, latitude, longitude, fetched_at,
                valid_time, horizon_hours, source, predicted_temp,
                predicted_precip_prob, predicted_precip_mm, predicted_wind_kmh
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (location_key, loc_name, lat, lon, fetched_at, valid_iso,
             horizon, source, pred_temp, pred_prob, pred_mm, pred_wind),
        )
        db.commit()
        row = db.execute("SELECT * FROM forecast_snapshots WHERE id = ?", (cur.lastrowid,)).fetchone()
        return {"saved_count": 1, "location_key": location_key, "snapshots": [dict(row)]}

    # Live Open-Meteo snapshot capture
    hours_count = body.get("hours", 24)
    if isinstance(hours_count, bool) or not isinstance(hours_count, int) or not (1 <= hours_count <= 72):
        raise ApiError("INVALID_REQUEST", "'hours' must be an integer between 1 and 72.", 400)

    raw = open_meteo.fetch_forecast(lat, lon)
    hourly_items = weather_formatter.format_hourly(raw, hours_count)
    if not hourly_items:
        raise ApiError("UPSTREAM_ERROR", "No hourly forecast data available to snapshot.", 502)

    saved_rows = []
    for idx, item in enumerate(hourly_items):
        cur = db.execute(
            """
            INSERT INTO forecast_snapshots (
                location_key, location_name, latitude, longitude, fetched_at,
                valid_time, horizon_hours, source, predicted_temp,
                predicted_precip_prob, predicted_precip_mm, predicted_wind_kmh,
                weather_code, payload_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                location_key,
                loc_name,
                lat,
                lon,
                fetched_at,
                item["time"],
                idx,
                "open-meteo",
                item["temperature"],
                item["precipitation_probability"],
                item["precipitation"],
                item["wind_speed"],
                item["weather_code"],
                json.dumps(item),
            ),
        )
        row = db.execute("SELECT * FROM forecast_snapshots WHERE id = ?", (cur.lastrowid,)).fetchone()
        saved_rows.append(dict(row))
    db.commit()

    return {
        "saved_count": len(saved_rows),
        "location_key": location_key,
        "location_name": loc_name,
        "fetched_at": fetched_at,
        "snapshots": saved_rows,
    }


def record_observation(body):
    """Store actual/observed weather measurements separately from predictions."""
    if not isinstance(body, dict):
        raise ApiError("INVALID_REQUEST", "JSON body is required.", 400)

    lat, lon, _ = _resolve_target(body)
    location_key = make_location_key(lat, lon)

    observed_at = body.get("observed_at")
    if not observed_at:
        observed_iso = cache_service.to_iso(cache_service.utc_now())
    else:
        _, observed_iso = _normalize_hour_key(observed_at)

    obs_temp = _parse_number(body.get("observed_temp"), "observed_temp", required=True)
    obs_precip = _parse_number(body.get("observed_precip_mm"), "observed_precip_mm")
    obs_wind = _parse_number(body.get("observed_wind_kmh"), "observed_wind_kmh")
    source = str(body.get("source") or "recorded-observation").strip() or "recorded-observation"

    db = get_db()
    cur = db.execute(
        """
        INSERT INTO observations (
            location_key, latitude, longitude, observed_at, source,
            observed_temp, observed_precip_mm, observed_wind_kmh
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (location_key, lat, lon, observed_iso, source, obs_temp, obs_precip, obs_wind),
    )
    db.commit()
    row = db.execute("SELECT * FROM observations WHERE id = ?", (cur.lastrowid,)).fetchone()
    return dict(row)


def compute_metrics(location_key=None, city=None, latitude=None, longitude=None):
    """Compare stored forecast snapshots against observations and return auditable metrics."""
    resolved_key = location_key
    if resolved_key is None:
        if isinstance(city, str) and city.strip():
            loc = open_meteo.search_locations(city.strip(), 1)[0]
            resolved_key = make_location_key(loc["latitude"], loc["longitude"])
        elif latitude is not None and longitude is not None:
            la, lo = open_meteo.parse_coordinates(latitude, longitude)
            resolved_key = make_location_key(la, lo)

    db = get_db()
    if resolved_key:
        snapshots = db.execute(
            "SELECT * FROM forecast_snapshots WHERE location_key = ? ORDER BY valid_time DESC, id DESC",
            (resolved_key,),
        ).fetchall()
        observations = db.execute(
            "SELECT * FROM observations WHERE location_key = ? ORDER BY observed_at DESC, id DESC",
            (resolved_key,),
        ).fetchall()
    else:
        snapshots = db.execute(
            "SELECT * FROM forecast_snapshots ORDER BY valid_time DESC, id DESC"
        ).fetchall()
        observations = db.execute(
            "SELECT * FROM observations ORDER BY observed_at DESC, id DESC"
        ).fetchall()

    # Index latest observation per (location_key, hour_key)
    obs_index = {}
    for obs in observations:
        hour_key, _ = _normalize_hour_key(obs["observed_at"])
        key = (obs["location_key"], hour_key)
        if key not in obs_index:
            obs_index[key] = dict(obs)

    comparisons = []
    seen_snap = set()
    for snap in snapshots:
        hour_key, _ = _normalize_hour_key(snap["valid_time"])
        key = (snap["location_key"], hour_key)
        if key in seen_snap:
            continue
        obs = obs_index.get(key)
        if obs is None or snap["predicted_temp"] is None or obs["observed_temp"] is None:
            continue
        seen_snap.add(key)

        temp_err = round(abs(snap["predicted_temp"] - obs["observed_temp"]), 2)
        precip_err = None
        if snap["predicted_precip_mm"] is not None and obs["observed_precip_mm"] is not None:
            precip_err = round(abs(snap["predicted_precip_mm"] - obs["observed_precip_mm"]), 2)

        comparisons.append({
            "location_key": snap["location_key"],
            "location_name": snap["location_name"],
            "valid_time": snap["valid_time"],
            "observed_at": obs["observed_at"],
            "fetched_at": snap["fetched_at"],
            "horizon_hours": snap["horizon_hours"],
            "forecast_source": snap["source"],
            "observation_source": obs["source"],
            "predicted_temp": snap["predicted_temp"],
            "observed_temp": obs["observed_temp"],
            "temperature_abs_error": temp_err,
            "predicted_precip_mm": snap["predicted_precip_mm"],
            "observed_precip_mm": obs["observed_precip_mm"],
            "precipitation_abs_error": precip_err,
        })

    min_samples = int(current_app.config.get("ACCURACY_MIN_SAMPLES", 3))
    sample_count = len(comparisons)
    temp_errors = [c["temperature_abs_error"] for c in comparisons]
    precip_errors = [c["precipitation_abs_error"] for c in comparisons if c["precipitation_abs_error"] is not None]

    # Aggregate by horizon
    by_horizon = {}
    for c in comparisons:
        h = c["horizon_hours"] if c["horizon_hours"] is not None else "unknown"
        by_horizon.setdefault(h, []).append(c["temperature_abs_error"])

    horizon_breakdown = [
        {
            "horizon_hours": h,
            "samples": len(errs),
            "temperature_mae": round(sum(errs) / len(errs), 2),
        }
        for h, errs in by_horizon.items()
    ]

    if sample_count < min_samples:
        return {
            "status": "insufficient_data",
            "location_key": resolved_key,
            "sample_count": sample_count,
            "minimum_sample_threshold": min_samples,
            "temperature_mae": round(sum(temp_errors) / sample_count, 2) if sample_count else None,
            "precipitation_mae": round(sum(precip_errors) / len(precip_errors), 2) if precip_errors else None,
            "within_2c_percent": None,
            "reliability_score": None,
            "reliability_formula": "max(0, 100 - temperature_mae * 15)",
            "units": {"temperature": "°C", "precipitation": "mm"},
            "message": (
                f"Insufficient comparable records ({sample_count}/{min_samples}). "
                "Accuracy percentages are not shown until enough matched records exist."
            ),
            "horizon_breakdown": horizon_breakdown,
            "comparisons": comparisons,
        }

    temp_mae = round(sum(temp_errors) / sample_count, 2)
    precip_mae = round(sum(precip_errors) / len(precip_errors), 2) if precip_errors else None
    within_2 = round(sum(1 for e in temp_errors if e <= 2.0) / sample_count * 100.0, 1)
    reliability_score = max(0.0, round(100.0 - temp_mae * 15.0, 1))

    return {
        "status": "available",
        "location_key": resolved_key,
        "sample_count": sample_count,
        "minimum_sample_threshold": min_samples,
        "temperature_mae": temp_mae,
        "precipitation_mae": precip_mae,
        "within_2c_percent": within_2,
        "reliability_score": reliability_score,
        "reliability_formula": "max(0, 100 - temperature_mae * 15)",
        "units": {"temperature": "°C", "precipitation": "mm"},
        "message": None,
        "horizon_breakdown": horizon_breakdown,
        "comparisons": comparisons,
    }
