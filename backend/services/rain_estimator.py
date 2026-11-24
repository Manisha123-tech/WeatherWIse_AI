"""Rain arrival estimator using hourly Open-Meteo probabilities and rainfall amounts."""
from services import weather_formatter
from utils.responses import ApiError

RAIN_PROB_THRESHOLD = 30
RAIN_CODES = {51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99}


def _classify_intensity(max_mm_per_hour, total_mm, has_thunder):
    if has_thunder or max_mm_per_hour >= 7.5 or total_mm >= 15.0:
        return "heavy"
    if max_mm_per_hour >= 2.5 or total_mm >= 5.0:
        return "moderate"
    return "light"


def estimate_rain(location, raw, hours=24):
    """Estimate the next likely rain window from hourly forecast data."""
    items = weather_formatter.format_hourly(raw, hours)
    if not items:
        raise ApiError("UPSTREAM_ERROR", "No hourly forecast data available to estimate rain.", 502)

    rain_indices = []
    for idx, item in enumerate(items):
        prob = item.get("precipitation_probability")
        precip = item.get("precipitation")
        code = item.get("weather_code")
        is_rain_hour = (
            (prob is not None and prob >= RAIN_PROB_THRESHOLD)
            or (precip is not None and precip > 0)
            or (code in RAIN_CODES)
        )
        if is_rain_hour:
            rain_indices.append(idx)

    if not rain_indices:
        return {
            "location": location,
            "window_hours": len(items),
            "rain_expected": False,
            "is_estimate": True,
            "estimate_label": "Estimate based on hourly forecast (not an exact prediction)",
            "estimated_start": None,
            "estimated_end": None,
            "likely_duration_hours": 0,
            "peak_time": None,
            "peak_probability": max(
                (i["precipitation_probability"] for i in items if i.get("precipitation_probability") is not None),
                default=None,
            ),
            "total_precipitation_mm": round(
                sum(i["precipitation"] for i in items if i.get("precipitation") is not None), 1
            ),
            "intensity_category": "none",
            "summary": (
                f"No rain is currently indicated in the next {len(items)} hours for "
                f"{location.get('display_name') or location.get('name') or 'this location'}."
            ),
        }

    # Find the first contiguous rain window
    start_idx = rain_indices[0]
    end_idx = start_idx
    while (end_idx + 1) in rain_indices:
        end_idx += 1

    window_items = items[start_idx : end_idx + 1]
    probs = [i["precipitation_probability"] for i in window_items if i.get("precipitation_probability") is not None]
    precips = [i["precipitation"] for i in window_items if i.get("precipitation") is not None]
    has_thunder = any(i.get("weather_code") in {95, 96, 99} for i in window_items)

    peak_item = max(
        window_items,
        key=lambda i: (i.get("precipitation_probability") or -1, i.get("precipitation") or 0),
    )
    max_mm = max(precips, default=0.0)
    total_mm = round(sum(precips), 1)
    duration = len(window_items)
    intensity = _classify_intensity(max_mm, total_mm, has_thunder)

    return {
        "location": location,
        "window_hours": len(items),
        "rain_expected": True,
        "is_estimate": True,
        "estimate_label": "Estimate based on hourly forecast (not an exact prediction)",
        "estimated_start": window_items[0]["time"],
        "estimated_end": window_items[-1]["time"],
        "likely_duration_hours": duration,
        "peak_time": peak_item["time"],
        "peak_probability": max(probs, default=None),
        "total_precipitation_mm": total_mm,
        "intensity_category": intensity,
        "summary": (
            f"Estimated {intensity} rain window starting around {window_items[0]['time']} "
            f"for roughly {duration} hour(s) (hourly forecast estimate, not an exact countdown)."
        ),
    }
