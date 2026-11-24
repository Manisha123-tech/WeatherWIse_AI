"""Central configuration for the WeatherWise AI backend."""
import os

# Folder where this file lives (the backend root folder)
BASE_DIR = os.path.abspath(os.path.dirname(__file__))


def _parse_cors_origins(value):
    if not value or value.strip() == "*":
        return "*"
    origins = [origin.strip() for origin in value.split(",") if origin.strip()]
    return origins or "*"


class Config:
    # Path to the SQLite database file
    DATABASE_PATH = os.environ.get(
        "DATABASE_PATH", os.path.join(BASE_DIR, "weatherwise.db")
    )

    # Used by Flask for security features and auth tokens; override in production
    SECRET_KEY = os.environ.get("SECRET_KEY", "change-this-in-production")

    # Which websites may call this API (the frontend address)
    CORS_ORIGINS = _parse_cors_origins(os.environ.get("CORS_ORIGINS", "*"))

    DEBUG = os.environ.get("FLASK_DEBUG", "true").lower() in ("1", "true", "yes")

    # Caching durations (seconds)
    FORECAST_CACHE_TTL_SECONDS = int(
        os.environ.get("FORECAST_CACHE_TTL_SECONDS", 900)
    )
    GEOCODING_CACHE_TTL_SECONDS = int(
        os.environ.get("GEOCODING_CACHE_TTL_SECONDS", 86400)
    )

    # Auth, community and accuracy defaults
    TOKEN_MAX_AGE_SECONDS = int(
        os.environ.get("TOKEN_MAX_AGE_SECONDS", 86400 * 7)
    )
    REPORT_EXPIRY_HOURS = int(os.environ.get("REPORT_EXPIRY_HOURS", 24))
    ACCURACY_MIN_SAMPLES = int(os.environ.get("ACCURACY_MIN_SAMPLES", 3))
