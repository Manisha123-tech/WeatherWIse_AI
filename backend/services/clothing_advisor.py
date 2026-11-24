"""Rule-based smart clothing and comfort advisor."""
from services import assistant_service, weather_formatter
from utils.responses import ApiError

ALLOWED_COMFORT = {"normal", "cold_sensitive", "heat_sensitive"}
ALLOWED_UNITS = {"celsius", "fahrenheit"}


def _to_unit(temp_c, unit):
    if temp_c is None:
        return None
    if unit == "fahrenheit":
        return round(temp_c * 9.0 / 5.0 + 32.0, 1)
    return round(temp_c, 1)


def advise_clothing(location, raw, hours=12, comfort_preference="normal", temperature_unit="celsius"):
    comfort = (comfort_preference or "normal").strip().lower()
    if comfort not in ALLOWED_COMFORT:
        raise ApiError("INVALID_REQUEST", "Invalid 'comfort_preference'.", 400)
    unit = (temperature_unit or "celsius").strip().lower()
    if unit not in ALLOWED_UNITS:
        raise ApiError("INVALID_REQUEST", "Invalid 'temperature_unit'.", 400)

    items = weather_formatter.format_hourly(raw, hours)
    if not items:
        raise ApiError("UPSTREAM_ERROR", "No hourly forecast data available for clothing advice.", 502)

    stats = assistant_service.summarise_window(items)
    current = weather_formatter.format_current(raw)

    feels_min = stats["feels_like_min"]
    feels_max = stats["feels_like_max"]
    if feels_min is None or feels_max is None:
        raise ApiError("UPSTREAM_ERROR", "Temperature data unavailable for clothing advice.", 502)

    shift = -2.0 if comfort == "cold_sensitive" else (2.0 if comfort == "heat_sensitive" else 0.0)
    avg_feels = (feels_min + feels_max) / 2.0 + shift

    recommended_items = []
    reasons = []
    cautions = []

    if avg_feels < 5:
        recommended_items.extend(["Heavy insulated coat", "Thermal base layer", "Warm gloves and cap"])
        reasons.append(f"Average feels-like temperature is very cold ({round(avg_feels, 1)} °C).")
        cautions.append("Cold conditions: dress warmly in insulated layers to stay comfortable.")
    elif avg_feels < 12:
        recommended_items.extend(["Warm jacket", "Sweater or fleece mid-layer", "Full-length trousers"])
        reasons.append(f"Average feels-like temperature is cold ({round(avg_feels, 1)} °C).")
    elif avg_feels < 20:
        recommended_items.extend(["Light jacket or cardigan", "Long-sleeve shirt or t-shirt"])
        reasons.append(f"Average feels-like temperature is cool ({round(avg_feels, 1)} °C).")
    elif avg_feels < 27:
        recommended_items.extend(["Comfortable t-shirt or casual shirt", "Light trousers or jeans"])
        reasons.append(f"Average feels-like temperature is mild/comfortable ({round(avg_feels, 1)} °C).")
    elif avg_feels < 33:
        recommended_items.extend(["Breathable cotton/linen clothing", "Sunglasses or cap"])
        reasons.append(f"Average feels-like temperature is warm ({round(avg_feels, 1)} °C).")
    else:
        recommended_items.extend(["Loose, light breathable clothing", "Sun hat and sunglasses", "Refillable water bottle"])
        reasons.append(f"Average feels-like temperature is hot ({round(avg_feels, 1)} °C).")
        cautions.append("Heat discomfort risk: seek shade during peak afternoon hours and stay hydrated.")

    if feels_max - feels_min >= assistant_service.WIDE_RANGE_C:
        recommended_items.append("Removable extra layer")
        reasons.append(f"Feels-like temperature varies by {round(feels_max - feels_min, 1)} °C over this window.")

    rain_prob = stats["rain_chance_max"]
    if (rain_prob is not None and rain_prob >= assistant_service.RAIN_CHANCE_MEDIUM) or stats["precipitation_total"] >= 0.5:
        recommended_items.extend(["Umbrella or waterproof rain jacket", "Water-resistant footwear"])
        reasons.append(f"Rain chance reaches {rain_prob}% with {stats['precipitation_total']} mm expected.")
        cautions.append("Wet conditions: allow extra walking/travel time on slick surfaces.")

    wind_max = stats["wind_max"]
    if wind_max is not None and wind_max >= assistant_service.BREEZY_KMH:
        recommended_items.append("Windbreaker outer layer")
        reasons.append(f"Wind speeds reach up to {round(wind_max)} km/h.")
        if wind_max >= assistant_service.STRONG_WIND_KMH:
            cautions.append("Strong gusts expected: a rain jacket is more practical than an umbrella.")

    if stats["thunderstorm"]:
        cautions.append("Thunderstorms forecast: plan to stay indoors during storm activity.")

    unit_symbol = "°F" if unit == "fahrenheit" else "°C"
    return {
        "location": location,
        "window_hours": len(items),
        "comfort_preference": comfort,
        "temperature_unit": unit,
        "recommended_items": list(dict.fromkeys(recommended_items)),
        "comfort_cautions": cautions,
        "reasons": reasons,
        "weather_inputs": {
            "current_temp": _to_unit(current.get("temperature"), unit),
            "feels_like_min": _to_unit(feels_min, unit),
            "feels_like_max": _to_unit(feels_max, unit),
            "rain_chance_max_percent": rain_prob,
            "precipitation_total_mm": stats["precipitation_total"],
            "wind_max_kmh": wind_max,
            "unit": unit_symbol,
        },
        "disclaimer": "Comfort guidance only, based on forecast inputs; not medical advice.",
    }
