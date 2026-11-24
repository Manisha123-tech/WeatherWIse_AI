"""Compare the weather of several cities or coordinate points side by side."""
from services import open_meteo, weather_formatter
from utils.responses import ApiError

MIN_CITIES = 2
MAX_CITIES = 5


def parse_city_list(text):
    """Turn 'Ranchi, Delhi,Mumbai' into ['Ranchi', 'Delhi', 'Mumbai'] (no repeats)."""
    if text is None or text.strip() == "":
        raise ApiError("INVALID_REQUEST",
                       "Provide 'cities', for example ?cities=Ranchi,Delhi,Mumbai.", 400)

    cities = []
    seen = set()
    for part in text.split(","):
        name = part.strip()
        if name == "":
            continue
        key = name.lower()
        if key in seen:
            continue
        seen.add(key)
        cities.append(name)

    if len(cities) < MIN_CITIES:
        raise ApiError("INVALID_REQUEST",
                       "Provide at least " + str(MIN_CITIES) + " different cities.", 400)
    if len(cities) > MAX_CITIES:
        raise ApiError("INVALID_REQUEST",
                       "You can compare at most " + str(MAX_CITIES) + " cities.", 400)
    return cities


def parse_location_specs(body):
    """Parse POST /api/compare JSON body supporting 'cities' or 'locations'."""
    if not isinstance(body, dict):
        raise ApiError("INVALID_REQUEST",
                       "Send JSON like {\"cities\": [\"Ranchi\", \"Delhi\"]}.", 400)

    raw_items = body.get("locations")
    if raw_items is None:
        raw_items = body.get("cities")

    if not isinstance(raw_items, list):
        raise ApiError("INVALID_REQUEST",
                       "Provide 'cities' or 'locations' as a list of 2 to 5 entries.", 400)

    specs = []
    seen = set()
    for item in raw_items:
        if isinstance(item, str):
            name = item.strip()
            if not name:
                continue
            key = ("city", name.lower())
            if key not in seen:
                seen.add(key)
                specs.append({"city": name, "latitude": None, "longitude": None, "query": name})
        elif isinstance(item, dict):
            city = item.get("city")
            lat = item.get("latitude")
            lon = item.get("longitude")
            if isinstance(city, str) and city.strip():
                name = city.strip()
                key = ("city", name.lower())
                if key not in seen:
                    seen.add(key)
                    specs.append({"city": name, "latitude": None, "longitude": None, "query": name})
            elif lat is not None and lon is not None:
                key = ("coords", str(lat), str(lon))
                if key not in seen:
                    seen.add(key)
                    specs.append({
                        "city": None,
                        "latitude": lat,
                        "longitude": lon,
                        "query": f"{lat},{lon}",
                    })
            else:
                raise ApiError(
                    "INVALID_REQUEST",
                    "Each location object must include 'city' or 'latitude' and 'longitude'.",
                    400,
                )
        else:
            raise ApiError(
                "INVALID_REQUEST",
                "Each entry in 'cities'/'locations' must be a city name or coordinate object.",
                400,
            )

    if len(specs) < MIN_CITIES:
        raise ApiError("INVALID_REQUEST",
                       "Provide at least " + str(MIN_CITIES) + " different locations.", 400)
    if len(specs) > MAX_CITIES:
        raise ApiError("INVALID_REQUEST",
                       "You can compare at most " + str(MAX_CITIES) + " locations.", 400)
    return specs


def build_city_entry(location, raw):
    """Pick the numbers we compare for one city."""
    current = weather_formatter.format_current(raw)
    today = weather_formatter.format_today(raw)

    hour_now = weather_formatter.format_hourly(raw, 1)
    rain_now = None
    if len(hour_now) > 0:
        rain_now = hour_now[0]["precipitation_probability"]

    return {
        "location": location,
        "temperature": current["temperature"],
        "feels_like": current["feels_like"],
        "humidity": current["humidity"],
        "wind_speed": current["wind_speed"],
        "rain_probability_now": rain_now,
        "rain_probability_today_max": today["precipitation_probability_max"],
        "precipitation_today": today["precipitation_sum"],
        "temp_max": today["temp_max"],
        "temp_min": today["temp_min"],
        "condition": current["condition"],
        "observed_at": current["time"],
        "hourly_next_12": weather_formatter.format_hourly(raw, 12),
        "daily": weather_formatter.format_daily(raw),
    }


def pick_extreme(entries, key, want_highest):
    """Find which city has the highest (or lowest) value for one measure."""
    best_entry = None
    best_value = None
    for entry in entries:
        value = entry.get(key)
        if value is None:
            continue
        if best_value is None:
            best_entry = entry
            best_value = value
        elif want_highest and value > best_value:
            best_entry = entry
            best_value = value
        elif (not want_highest) and value < best_value:
            best_entry = entry
            best_value = value

    if best_entry is None:
        return None
    city_label = (best_entry["location"].get("display_name")
                  or best_entry["location"].get("name")
                  or f"{best_entry['location'].get('latitude')}, {best_entry['location'].get('longitude')}")
    return {
        "city": city_label,
        "value": best_value,
    }


def build_summary(entries):
    """Say who is hottest, coolest, most humid, windiest and rainiest."""
    if len(entries) < 2:
        return None
    return {
        "hottest": pick_extreme(entries, "temperature", True),
        "coolest": pick_extreme(entries, "temperature", False),
        "most_humid": pick_extreme(entries, "humidity", True),
        "windiest": pick_extreme(entries, "wind_speed", True),
        "highest_rain_chance": pick_extreme(entries, "rain_probability_today_max", True),
    }


def compare_location_specs(specs):
    """Fetch every location. Partial failures are listed in 'failed'."""
    entries = []
    failed = []
    first_error = None
    units = None

    for spec in specs:
        try:
            location, raw = open_meteo.get_location_and_forecast(
                spec["city"], spec["latitude"], spec["longitude"]
            )
            entries.append(build_city_entry(location, raw))
            if units is None:
                units = weather_formatter.build_units(raw)
        except ApiError as error:
            if first_error is None:
                first_error = error
            failed.append({
                "query": spec["query"],
                "error": {"code": error.code, "message": error.message},
            })

    if len(entries) == 0:
        raise first_error

    return {
        "cities": entries,
        "failed": failed,
        "summary": build_summary(entries),
        "units": units,
    }


def compare_cities(city_names):
    """Fetch every city. A city that fails is listed in 'failed', not fatal."""
    specs = [
        {"city": name, "latitude": None, "longitude": None, "query": name}
        for name in city_names
    ]
    return compare_location_specs(specs)
