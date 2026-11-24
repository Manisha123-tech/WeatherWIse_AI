"""Turns raw Open-Meteo data into our own clean, consistent JSON shapes."""

WEATHER_CODES = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Rime fog",
    51: "Light drizzle",
    53: "Moderate drizzle",
    55: "Dense drizzle",
    56: "Light freezing drizzle",
    57: "Dense freezing drizzle",
    61: "Slight rain",
    63: "Moderate rain",
    65: "Heavy rain",
    66: "Light freezing rain",
    67: "Heavy freezing rain",
    71: "Slight snow",
    73: "Moderate snow",
    75: "Heavy snow",
    77: "Snow grains",
    80: "Slight rain showers",
    81: "Moderate rain showers",
    82: "Violent rain showers",
    85: "Slight snow showers",
    86: "Heavy snow showers",
    95: "Thunderstorm",
    96: "Thunderstorm with slight hail",
    99: "Thunderstorm with heavy hail",
}


def describe_weather_code(code):
    if code is None or isinstance(code, bool):
        return "Unknown"
    try:
        return WEATHER_CODES.get(code, "Unknown")
    except TypeError:
        return "Unknown"


def _value(values, index):
    """Safely read values[index]; return None if it is missing."""
    if not isinstance(values, (list, tuple)) or index < 0 or index >= len(values):
        return None
    return values[index]


def build_units(raw):
    current_units = raw.get("current_units") or {}
    return {
        "temperature": current_units.get("temperature_2m", "\u00b0C"),
        "humidity": current_units.get("relative_humidity_2m", "%"),
        "wind_speed": current_units.get("wind_speed_10m", "km/h"),
        "wind_direction": current_units.get("wind_direction_10m", "\u00b0"),
        "precipitation": current_units.get("precipitation", "mm"),
        "precipitation_probability": "%",
    }


def format_current(raw):
    current = raw["current"]
    code = current.get("weather_code")
    return {
        "time": current.get("time"),
        "temperature": current.get("temperature_2m"),
        "feels_like": current.get("apparent_temperature"),
        "humidity": current.get("relative_humidity_2m"),
        "wind_speed": current.get("wind_speed_10m"),
        "wind_direction": current.get("wind_direction_10m"),
        "precipitation": current.get("precipitation"),
        "weather_code": code,
        "condition": describe_weather_code(code),
        "is_day": bool(current.get("is_day")),
    }


def format_today(raw):
    """Today's highlights: high/low, sunrise, sunset, rain."""
    daily = raw["daily"]
    return {
        "date": _value(daily.get("time"), 0),
        "temp_max": _value(daily.get("temperature_2m_max"), 0),
        "temp_min": _value(daily.get("temperature_2m_min"), 0),
        "sunrise": _value(daily.get("sunrise"), 0),
        "sunset": _value(daily.get("sunset"), 0),
        "precipitation_sum": _value(daily.get("precipitation_sum"), 0),
        "precipitation_probability_max": _value(
            daily.get("precipitation_probability_max"), 0),
    }


def format_hourly(raw, hours):
    """Return the next `hours` hours, starting from the current hour."""
    hourly = raw["hourly"]
    times = hourly.get("time") or []
    if not isinstance(times, list):
        return []

    # "2026-11-25T14:45" -> "2026-11-25T14:00" (ISO text sorts correctly)
    current_time = raw["current"].get("time") or ""
    if isinstance(current_time, str) and len(current_time) >= 13:
        current_hour = current_time[:13] + ":00"
        start_index = len(times)
        for index, time_str in enumerate(times):
            if isinstance(time_str, str) and time_str >= current_hour:
                start_index = index
                break
    else:
        start_index = 0

    end_index = min(start_index + hours, len(times))

    items = []
    for index in range(start_index, end_index):
        code = _value(hourly.get("weather_code"), index)
        items.append({
            "time": times[index],
            "temperature": _value(hourly.get("temperature_2m"), index),
            "feels_like": _value(hourly.get("apparent_temperature"), index),
            "humidity": _value(hourly.get("relative_humidity_2m"), index),
            "precipitation_probability": _value(
                hourly.get("precipitation_probability"), index),
            "precipitation": _value(hourly.get("precipitation"), index),
            "wind_speed": _value(hourly.get("wind_speed_10m"), index),
            "weather_code": code,
            "condition": describe_weather_code(code),
        })
    return items


def format_daily(raw):
    """Return the 7-day forecast."""
    daily = raw["daily"]
    dates = daily.get("time") or []
    if not isinstance(dates, list):
        return []

    items = []
    for index in range(len(dates)):
        code = _value(daily.get("weather_code"), index)
        items.append({
            "date": dates[index],
            "weather_code": code,
            "condition": describe_weather_code(code),
            "temp_max": _value(daily.get("temperature_2m_max"), index),
            "temp_min": _value(daily.get("temperature_2m_min"), index),
            "feels_like_max": _value(daily.get("apparent_temperature_max"), index),
            "feels_like_min": _value(daily.get("apparent_temperature_min"), index),
            "sunrise": _value(daily.get("sunrise"), index),
            "sunset": _value(daily.get("sunset"), index),
            "precipitation_sum": _value(daily.get("precipitation_sum"), index),
            "precipitation_probability_max": _value(
                daily.get("precipitation_probability_max"), index),
            "wind_speed_max": _value(daily.get("wind_speed_10m_max"), index),
        })
    return items
