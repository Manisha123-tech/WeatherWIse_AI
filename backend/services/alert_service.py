"""Weather alerts & advisories: strictly separates official feeds, app advisories and community reports."""
from datetime import timedelta

from database.db import get_db
from services import assistant_service, cache_service, community_service, open_meteo, weather_formatter
from utils.responses import ApiError

ALLOWED_ALERT_TYPES = {"heavy_rain", "thunderstorm", "heat", "strong_wind", "flood"}
ALLOWED_SEVERITIES = {"minor", "moderate", "severe", "extreme"}


def store_official_alert(body):
    """Store a normalized official weather alert (from an authorized feed/ingestion)."""
    if not isinstance(body, dict):
        raise ApiError("INVALID_REQUEST", "JSON body is required.", 400)

    source = str(body.get("source") or "").strip()
    alert_type = str(body.get("alert_type") or "").strip().lower()
    severity = str(body.get("severity") or "").strip().lower()
    area = str(body.get("area") or "").strip()
    headline = str(body.get("headline") or "").strip()

    if not source or not area or not headline:
        raise ApiError("INVALID_REQUEST", "'source', 'area', and 'headline' are required.", 400)
    if alert_type not in ALLOWED_ALERT_TYPES:
        raise ApiError("INVALID_REQUEST", "Unsupported 'alert_type'.", 400)
    if severity not in ALLOWED_SEVERITIES:
        raise ApiError("INVALID_REQUEST", "Unsupported 'severity'.", 400)

    lat = body.get("latitude")
    lon = body.get("longitude")
    if lat is not None or lon is not None:
        lat, lon = open_meteo.parse_coordinates(lat, lon)

    now = cache_service.utc_now()
    issued_dt = cache_service.parse_iso(body.get("issued_at")) or now
    expires_dt = cache_service.parse_iso(body.get("expires_at"))
    if expires_dt is None:
        expires_dt = issued_dt + timedelta(hours=12)

    if expires_dt <= issued_dt:
        raise ApiError("INVALID_REQUEST", "'expires_at' must be after 'issued_at'.", 400)

    description = body.get("description")
    source_ref = body.get("source_reference")

    db = get_db()
    cur = db.execute(
        """
        INSERT INTO weather_alerts (
            source, alert_type, severity, area, latitude, longitude,
            issued_at, expires_at, headline, description, source_reference, is_official
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        """,
        (
            source,
            alert_type,
            severity,
            area,
            lat,
            lon,
            cache_service.to_iso(issued_dt),
            cache_service.to_iso(expires_dt),
            headline,
            str(description) if description is not None else None,
            str(source_ref) if source_ref is not None else None,
        ),
    )
    db.commit()
    row = db.execute("SELECT * FROM weather_alerts WHERE id = ?", (cur.lastrowid,)).fetchone()
    return dict(row)


def _derive_advisories(location, raw):
    """Build clearly-labeled application advisories from live forecast numbers."""
    items = weather_formatter.format_hourly(raw, 24)
    if not items:
        return []

    stats = assistant_service.summarise_window(items)
    area_name = location.get("display_name") or location.get("name") or "this area"
    advisories = []

    if stats["thunderstorm"]:
        advisories.append({
            "source_type": "application_advisory",
            "is_official": False,
            "alert_type": "thunderstorm",
            "severity": "moderate",
            "area": area_name,
            "headline": "Thunderstorm forecast in the next 24 hours",
            "reason": "Open-Meteo weather codes indicate thunderstorm activity.",
        })
    if stats["heavy_rain"] or stats["precipitation_total"] >= assistant_service.HEAVY_RAIN_MM:
        advisories.append({
            "source_type": "application_advisory",
            "is_official": False,
            "alert_type": "heavy_rain",
            "severity": "moderate",
            "area": area_name,
            "headline": "Heavy rain expected in the next 24 hours",
            "reason": f"Total forecast precipitation reaches {stats['precipitation_total']} mm.",
        })
    if stats["feels_like_max"] is not None and stats["feels_like_max"] >= assistant_service.EXTREME_HEAT_C:
        advisories.append({
            "source_type": "application_advisory",
            "is_official": False,
            "alert_type": "heat",
            "severity": "moderate",
            "area": area_name,
            "headline": "Extreme heat advisory",
            "reason": f"Feels-like temperature reaches {round(stats['feels_like_max'], 1)} °C.",
        })
    if stats["wind_max"] is not None and stats["wind_max"] >= assistant_service.STRONG_WIND_KMH:
        advisories.append({
            "source_type": "application_advisory",
            "is_official": False,
            "alert_type": "strong_wind",
            "severity": "moderate",
            "area": area_name,
            "headline": "Strong wind advisory",
            "reason": f"Forecast winds reach up to {round(stats['wind_max'], 1)} km/h.",
        })
    return advisories


def get_alerts(city=None, latitude=None, longitude=None, area=None):
    location, raw = open_meteo.get_location_and_forecast(city, latitude, longitude)
    area_filter = (area or location.get("name") or location.get("admin1") or "").strip().lower()

    now = cache_service.utc_now()
    rows = get_db().execute("SELECT * FROM weather_alerts ORDER BY issued_at DESC, id DESC").fetchall()

    official_alerts = []
    for row in rows:
        item = dict(row)
        exp_dt = cache_service.parse_iso(item["expires_at"])
        if exp_dt is not None and now >= exp_dt:
            continue
        if area_filter and area_filter not in item["area"].lower():
            if item["latitude"] is None or item["longitude"] is None:
                continue
            if community_service._haversine_km(
                location["latitude"], location["longitude"], item["latitude"], item["longitude"]
            ) > 100.0:
                continue
        item["source_type"] = "official_alert"
        item["is_official"] = bool(item["is_official"])
        official_alerts.append(item)

    advisories = _derive_advisories(location, raw)

    nearby_reports = community_service.list_reports(
        status="approved",
        include_expired=False,
        latitude=location["latitude"],
        longitude=location["longitude"],
        radius_km=50.0,
    )
    community_hazard_reports = [
        {
            "id": r["id"],
            "source_type": "community_report",
            "is_official": False,
            "category": r["category"],
            "verification_status": r["verification_status"],
            "location_name": r["location_name"],
            "description": r["description"],
            "created_at": r["created_at"],
        }
        for r in nearby_reports
    ]

    official_available = len(official_alerts) > 0
    return {
        "location": location,
        "official_feed_status": "available" if official_available else "unavailable",
        "official_feed_message": (
            None
            if official_available
            else "No external official alert feed (such as IMD) is connected and no active official alerts exist for this area."
        ),
        "official_alerts": official_alerts,
        "advisories": advisories,
        "community_reports": community_hazard_reports,
    }
