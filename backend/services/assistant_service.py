"""A simple rule-based weather assistant.

It does not guess: every answer is built from the real forecast numbers.
"""
import re

from services import weather_formatter
from utils.responses import ApiError

MAX_QUESTION_LENGTH = 300
WINDOW_HOURS = 12

# Easy-to-change thresholds
RAIN_CHANCE_HIGH = 60        # percent
RAIN_CHANCE_MEDIUM = 30      # percent
RAIN_TOTAL_HIGH_MM = 2.0
RAIN_TOTAL_LOW_MM = 0.5
HEAVY_RAIN_MM = 10.0
STRONG_WIND_KMH = 40
BREEZY_KMH = 30
EXTREME_HEAT_C = 40
WIDE_RANGE_C = 8

THUNDER_CODES = [95, 96, 99]
HEAVY_RAIN_CODES = [65, 67, 82]
FOG_CODES = [45, 48]

UMBRELLA_WORDS = ["umbrella", "umbrellas", "raincoat", "raincoats"]
CLOTHING_WORDS = ["wear", "clothes", "clothing", "jacket", "jackets", "sweater",
                  "sweaters", "coat", "coats", "dress", "outfit", "hoodie",
                  "shorts", "jumper"]
TRAVEL_WORDS = ["travel", "travelling", "traveling", "trip", "trips", "drive",
                "driving", "commute", "journey", "road", "outdoor", "outdoors",
                "outside", "walk", "walks", "ride", "rides"]
RAIN_WORDS = ["rain", "rains", "raining", "rainy", "shower", "showers",
              "drizzle", "drizzling", "storm", "storms", "thunderstorm",
              "thunderstorms", "wet", "precipitation"]

SUPPORTED_TOPICS = ["umbrella", "clothing", "travel", "rain"]


def validate_question(question):
    if not isinstance(question, str) or question.strip() == "":
        raise ApiError("INVALID_REQUEST", "'question' must be some text.", 400)
    question = question.strip()
    if len(question) > MAX_QUESTION_LENGTH:
        raise ApiError("INVALID_REQUEST",
                       "'question' must be at most " + str(MAX_QUESTION_LENGTH)
                       + " characters.", 400)
    return question


def _contains_any(words, keywords):
    for word in words:
        if word in keywords:
            return True
    return False


def detect_intent(question):
    """Match whole words only, so 'training' is not mistaken for 'rain'."""
    words = re.findall(r"[a-z]+", question.lower())
    if _contains_any(words, UMBRELLA_WORDS):
        return "umbrella"
    if _contains_any(words, CLOTHING_WORDS):
        return "clothing"
    if _contains_any(words, TRAVEL_WORDS):
        return "travel"
    if _contains_any(words, RAIN_WORDS):
        return "rain"
    return "general"


def choose_window(question, raw):
    """Look at 'tomorrow' if the question says so, else the next 12 hours."""
    words = re.findall(r"[a-z]+", question.lower())

    if "tomorrow" in words:
        daily = weather_formatter.format_daily(raw)
        if len(daily) < 2 or not isinstance(daily[1].get("date"), str):
            raise ApiError("UPSTREAM_ERROR",
                           "The weather service sent no forecast data for tomorrow.", 502)
        tomorrow_date = daily[1]["date"]
        all_hours = weather_formatter.format_hourly(raw, 168)
        items = []
        for item in all_hours:
            time_str = item.get("time")
            if isinstance(time_str, str) and time_str[:10] == tomorrow_date:
                items.append(item)
        label = "tomorrow"
    else:
        items = weather_formatter.format_hourly(raw, WINDOW_HOURS)
        label = "in the next " + str(WINDOW_HOURS) + " hours"

    if len(items) == 0:
        raise ApiError("UPSTREAM_ERROR",
                       "The weather service sent no hourly data for that time.", 502)
    return label, items


def summarise_window(items):
    """Boil a list of hourly items down to the numbers the rules need."""
    stats = {
        "rain_chance_max": None,
        "peak_time": None,
        "precipitation_total": 0.0,
        "temp_min": None,
        "temp_max": None,
        "feels_like_min": None,
        "feels_like_max": None,
        "wind_max": None,
        "thunderstorm": False,
        "heavy_rain": False,
        "fog": False,
    }

    for item in items:
        chance = item["precipitation_probability"]
        if chance is not None:
            if stats["rain_chance_max"] is None or chance > stats["rain_chance_max"]:
                stats["rain_chance_max"] = chance
                stats["peak_time"] = item["time"]

        if item["precipitation"] is not None:
            stats["precipitation_total"] = stats["precipitation_total"] + item["precipitation"]

        temp = item["temperature"]
        if temp is not None:
            if stats["temp_min"] is None or temp < stats["temp_min"]:
                stats["temp_min"] = temp
            if stats["temp_max"] is None or temp > stats["temp_max"]:
                stats["temp_max"] = temp

        feels = item["feels_like"]
        if feels is not None:
            if stats["feels_like_min"] is None or feels < stats["feels_like_min"]:
                stats["feels_like_min"] = feels
            if stats["feels_like_max"] is None or feels > stats["feels_like_max"]:
                stats["feels_like_max"] = feels

        wind = item["wind_speed"]
        if wind is not None:
            if stats["wind_max"] is None or wind > stats["wind_max"]:
                stats["wind_max"] = wind

        code = item["weather_code"]
        if code in THUNDER_CODES:
            stats["thunderstorm"] = True
        if code in HEAVY_RAIN_CODES:
            stats["heavy_rain"] = True
        if code in FOG_CODES:
            stats["fog"] = True

    stats["precipitation_total"] = round(stats["precipitation_total"], 1)
    return stats


def _hour_text(time_text):
    """'2026-11-25T16:00' -> '16:00'"""
    if not isinstance(time_text, str) or len(time_text) < 16:
        return "an unknown time"
    return time_text[11:16]


def _round(value):
    if value is None:
        return "unknown"
    return str(round(value))


def answer_umbrella(label, stats, current, place):
    chance = stats["rain_chance_max"]
    total = stats["precipitation_total"]
    if chance is None:
        return ("I couldn't find rain-chance data for " + label + " in " + place
                + ", so I can't say if you need an umbrella.")

    if chance >= RAIN_CHANCE_HIGH or total >= RAIN_TOTAL_HIGH_MM:
        verdict = "Yes, take an umbrella."
    elif chance >= RAIN_CHANCE_MEDIUM or total >= RAIN_TOTAL_LOW_MM:
        verdict = "Maybe - a compact umbrella is a good idea."
    else:
        verdict = "No, you probably don't need an umbrella."

    text = (verdict + " In " + place + " the chance of rain reaches " + _round(chance)
            + "% (around " + _hour_text(stats["peak_time"]) + ") with about "
            + str(total) + " mm expected " + label + ".")

    if label.startswith("in the next") and current["precipitation"] and current["precipitation"] > 0:
        text = text + " It is raining there right now."
    if stats["wind_max"] is not None and stats["wind_max"] >= STRONG_WIND_KMH:
        text = (text + " Winds up to " + _round(stats["wind_max"])
                + " km/h are expected, so a rain jacket may work better than an umbrella.")
    return text


def answer_rain(label, stats, place):
    chance = stats["rain_chance_max"]
    total = stats["precipitation_total"]
    if chance is None:
        return ("I couldn't find rain-chance data for " + label + " in " + place + ".")

    if chance >= RAIN_CHANCE_HIGH:
        level = "Rain is likely"
    elif chance >= RAIN_CHANCE_MEDIUM:
        level = "Rain is possible"
    else:
        level = "Rain is unlikely"

    return (level + " " + label + " in " + place + ". The chance peaks at "
            + _round(chance) + "% around " + _hour_text(stats["peak_time"])
            + ", and about " + str(total) + " mm is expected in total.")


def answer_clothing(label, stats, place, comfort_preference="normal"):
    low = stats["feels_like_min"]
    high = stats["feels_like_max"]
    if low is None or high is None:
        return ("I couldn't find temperature data for " + label + " in " + place + ".")

    shift = 0.0
    if comfort_preference == "cold_sensitive":
        shift = -2.0
    elif comfort_preference == "heat_sensitive":
        shift = 2.0

    average = (low + high) / 2.0 + shift
    if average < 5:
        advice = "It is very cold, so wear a warm coat, layers, a hat and gloves."
    elif average < 12:
        advice = "It is cold, so wear a warm jacket over a sweater."
    elif average < 20:
        advice = "It is cool, so a light jacket or sweater is a good idea."
    elif average < 27:
        advice = "It is comfortable, so light clothes like a t-shirt or shirt will do."
    elif average < 33:
        advice = "It is warm, so wear light, breathable clothes."
    else:
        advice = "It is hot, so wear light, loose, breathable clothes and drink plenty of water."

    text = ("Feels-like temperature in " + place + " " + label + " is "
            + _round(low) + " to " + _round(high) + " degrees. " + advice)

    if high - low >= WIDE_RANGE_C:
        text = text + " The temperature changes a lot, so dress in layers."
    chance = stats["rain_chance_max"]
    if chance is not None and chance >= RAIN_CHANCE_MEDIUM:
        text = (text + " Rain is possible (" + _round(chance)
                + "%), so bring an umbrella or a waterproof jacket.")
    if stats["wind_max"] is not None and stats["wind_max"] >= BREEZY_KMH:
        text = (text + " It will be windy (up to " + _round(stats["wind_max"])
                + " km/h), so a windbreaker helps.")
    return text


def answer_travel(label, stats, place):
    warnings = []
    if stats["thunderstorm"]:
        warnings.append("thunderstorms are forecast")
    if stats["heavy_rain"] or stats["precipitation_total"] >= HEAVY_RAIN_MM:
        warnings.append("heavy rain is expected, so expect delays and drive slowly")
    elif stats["rain_chance_max"] is not None and stats["rain_chance_max"] >= RAIN_CHANCE_HIGH:
        warnings.append("rain is likely (" + _round(stats["rain_chance_max"])
                        + "%), so allow extra time")
    if stats["fog"]:
        warnings.append("fog may reduce visibility")
    if stats["wind_max"] is not None and stats["wind_max"] >= STRONG_WIND_KMH:
        warnings.append("strong winds up to " + _round(stats["wind_max"]) + " km/h")
    if stats["feels_like_max"] is not None and stats["feels_like_max"] >= EXTREME_HEAT_C:
        warnings.append("extreme heat (feels like " + _round(stats["feels_like_max"])
                        + " degrees), so carry water and avoid midday travel")

    if len(warnings) > 0:
        return ("Take care when travelling in " + place + " " + label + ": "
                + "; ".join(warnings) + ". Check the forecast again before you leave.")

    details = []
    if stats["rain_chance_max"] is not None:
        details.append("the highest rain chance is " + _round(stats["rain_chance_max"]) + "%")
    if stats["wind_max"] is not None:
        details.append("winds reach up to " + _round(stats["wind_max"]) + " km/h")

    if details:
        summary_text = " and ".join(details)
        summary_text = summary_text[0].upper() + summary_text[1:] + "."
        return ("Conditions look fine for travel in " + place + " " + label
                + ". " + summary_text)

    return ("Conditions look fine for travel in " + place + " " + label + ".")


def answer_general(current, units, place):
    condition_text = (current.get("condition") or "unknown").lower()
    return ("Right now in " + place + " it is " + _round(current["temperature"])
            + units["temperature"] + " (feels like " + _round(current["feels_like"])
            + units["temperature"] + "), " + condition_text
            + ", humidity " + _round(current["humidity"]) + "%, wind "
            + _round(current["wind_speed"]) + " " + units["wind_speed"]
            + ". You can also ask me about umbrellas, clothing, travel or rain.")


def _build_disclaimer(stats, current):
    missing = []
    if current.get("temperature") is None:
        missing.append("current temperature")
    if stats is not None:
        if stats.get("rain_chance_max") is None:
            missing.append("hourly rain probability")
        if stats.get("feels_like_min") is None or stats.get("feels_like_max") is None:
            missing.append("feels-like temperature")
    if missing:
        return (
            "Some forecast fields (" + ", ".join(missing)
            + ") were unavailable from the weather provider. Guidance is based only on available data."
        )
    return "Forecast-based guidance only; check live local conditions before critical outdoor or travel decisions."


def ask_assistant(question, location, raw, preferences=None):
    """Answer one question using the real forecast in `raw`."""
    intent = detect_intent(question)
    current = weather_formatter.format_current(raw)
    units = weather_formatter.build_units(raw)

    place = location.get("display_name") or location.get("name") or "this location"
    prefs = preferences if isinstance(preferences, dict) else {}
    comfort_preference = prefs.get("comfort_preference", "normal")

    window = None
    stats = None

    if intent == "general":
        answer = answer_general(current, units, place)
    else:
        window, items = choose_window(question, raw)
        stats = summarise_window(items)
        if intent == "umbrella":
            answer = answer_umbrella(window, stats, current, place)
        elif intent == "rain":
            answer = answer_rain(window, stats, place)
        elif intent == "clothing":
            answer = answer_clothing(window, stats, place, comfort_preference)
        else:
            answer = answer_travel(window, stats, place)

    return {
        "question": question,
        "intent": intent,
        "answer": answer,
        "window": window,
        "facts": stats,
        "current": current,
        "location": location,
        "units": units,
        "preferences_applied": prefs,
        "disclaimer": _build_disclaimer(stats, current),
        "supported_topics": SUPPORTED_TOPICS,
    }
