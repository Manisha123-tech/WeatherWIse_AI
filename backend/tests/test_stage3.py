"""Stage 3 tests (compare + assistant + PIN codes). Open-Meteo is mocked.

Run with: python -m unittest discover tests -v
"""
import os
import sys
import tempfile
import unittest
from unittest.mock import patch

import requests

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app
from config import Config


class TestConfig(Config):
    TESTING = True


class FakeResponse:
    def __init__(self, status_code, payload):
        self.status_code = status_code
        self.payload = payload

    def json(self):
        return self.payload


def build_payload(temp=24.0, humidity=48, wind=9.0, rain=None, codes=None):
    """Make a fake 48-hour forecast. 'rain' and 'codes' map hour number -> value."""
    if rain is None:
        rain = {}
    if codes is None:
        codes = {}

    times = []
    temps = []
    feels = []
    probs = []
    weather_codes = []
    zeros = []
    humidities = []
    winds = []
    for hour_number in range(48):
        day = 25 + hour_number // 24
        hour = hour_number % 24
        times.append("2026-11-%02dT%02d:00" % (day, hour))
        temps.append(temp)
        feels.append(temp - 1)
        probs.append(rain.get(hour_number, 5))
        weather_codes.append(codes.get(hour_number, 0))
        zeros.append(0.0)
        humidities.append(humidity)
        winds.append(wind)

    today_max_rain = max(probs[0:24])
    tomorrow_max_rain = max(probs[24:48])
    daily_rain = [today_max_rain, tomorrow_max_rain, 5, 5, 5, 5, 5]
    seven = [1, 2, 3, 4, 5, 6, 7]

    return {
        "timezone": "Asia/Kolkata",
        "current_units": {
            "temperature_2m": "\u00b0C", "relative_humidity_2m": "%",
            "wind_speed_10m": "km/h", "wind_direction_10m": "\u00b0",
            "precipitation": "mm",
        },
        "current": {
            "time": "2026-11-25T14:45", "temperature_2m": temp,
            "relative_humidity_2m": humidity, "apparent_temperature": temp - 1,
            "is_day": 1, "precipitation": 0.0, "weather_code": 0,
            "wind_speed_10m": wind, "wind_direction_10m": 270,
        },
        "hourly": {
            "time": times, "temperature_2m": temps, "apparent_temperature": feels,
            "relative_humidity_2m": humidities, "precipitation_probability": probs,
            "precipitation": zeros, "weather_code": weather_codes,
            "wind_speed_10m": winds,
        },
        "daily": {
            "time": ["2026-11-25", "2026-11-26", "2026-11-27", "2026-11-28",
                     "2026-11-29", "2026-11-30", "2026-12-01"],
            "weather_code": seven,
            "temperature_2m_max": [temp + 3] * 7,
            "temperature_2m_min": [temp - 5] * 7,
            "apparent_temperature_max": seven, "apparent_temperature_min": seven,
            "sunrise": ["2026-11-25T06:05"] * 7, "sunset": ["2026-11-25T17:03"] * 7,
            "precipitation_sum": seven,
            "precipitation_probability_max": daily_rain,
            "wind_speed_10m_max": seven,
        },
    }


# Three fake cities with different weather
CITIES = {
    "Ranchi": {"lat": 23.35, "lon": 85.33,
               "payload": build_payload(temp=24.0, humidity=48, wind=9.0, rain={16: 20})},
    "Delhi": {"lat": 28.61, "lon": 77.21,
              "payload": build_payload(temp=18.0, humidity=60, wind=15.0, rain={16: 10})},
    "Mumbai": {"lat": 19.07, "lon": 72.87,
               "payload": build_payload(temp=31.0, humidity=80, wind=25.0, rain={14: 70})},
}


def make_fake_get(single_payload=None):
    """Return a fake requests.get. With single_payload, every forecast is that payload."""

    def fake_get(url, params=None, timeout=None):
        if "geocoding" in url:
            name = params["name"]
            if name in CITIES:
                city = CITIES[name]
                return FakeResponse(200, {"results": [{
                    "id": 1, "name": name, "latitude": city["lat"],
                    "longitude": city["lon"], "country": "India",
                    "admin1": "Test State", "timezone": "Asia/Kolkata",
                    "postcodes": ["834001", "834002"],
                }]})
            return FakeResponse(200, {"generationtime_ms": 0.4})

        if single_payload is not None:
            return FakeResponse(200, single_payload)
        for name in CITIES:
            if CITIES[name]["lat"] == params["latitude"]:
                return FakeResponse(200, CITIES[name]["payload"])
        return FakeResponse(200, build_payload())

    return fake_get


class Stage3Tests(unittest.TestCase):
    def setUp(self):
        self.temp_file = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        self.temp_file.close()
        TestConfig.DATABASE_PATH = self.temp_file.name
        self.client = create_app(TestConfig).test_client()

    def tearDown(self):
        os.remove(self.temp_file.name)

    def ask(self, question, payload=None, extra=None):
        body = {"question": question, "city": "Ranchi"}
        if extra is not None:
            body.update(extra)
        with patch("services.open_meteo.requests.get",
                   side_effect=make_fake_get(payload)):
            return self.client.post("/api/assistant", json=body)

    # ---------- PIN codes ----------
    def test_location_search_returns_postcodes(self):
        with patch("services.open_meteo.requests.get", side_effect=make_fake_get()):
            response = self.client.get("/api/location?q=Ranchi")
        first = response.get_json()["data"]["locations"][0]
        self.assertEqual(first["postcodes"], ["834001", "834002"])

    # ---------- compare ----------
    @patch("services.open_meteo.requests.get", side_effect=make_fake_get())
    def test_compare_three_cities(self, mock_get):
        response = self.client.get("/api/compare?cities=Ranchi,Delhi,Mumbai")
        data = response.get_json()["data"]
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(data["cities"]), 3)
        self.assertEqual(data["failed"], [])
        self.assertEqual(data["summary"]["hottest"]["city"], "Mumbai, Test State, India")
        self.assertEqual(data["summary"]["coolest"]["value"], 18.0)
        self.assertEqual(data["summary"]["most_humid"]["value"], 80)
        self.assertEqual(data["summary"]["windiest"]["value"], 25.0)
        self.assertEqual(data["summary"]["highest_rain_chance"]["value"], 70)
        mumbai = data["cities"][2]
        self.assertEqual(mumbai["rain_probability_now"], 70)
        self.assertEqual(mumbai["rain_probability_today_max"], 70)

    def test_compare_needs_two_to_five_cities(self):
        self.assertEqual(self.client.get("/api/compare").status_code, 400)
        self.assertEqual(self.client.get("/api/compare?cities=Ranchi").status_code, 400)
        self.assertEqual(
            self.client.get("/api/compare?cities=Ranchi,Ranchi").status_code, 400)
        many = "/api/compare?cities=A1,B2,C3,D4,E5,F6"
        self.assertEqual(self.client.get(many).status_code, 400)

    @patch("services.open_meteo.requests.get", side_effect=make_fake_get())
    def test_compare_one_city_fails(self, mock_get):
        response = self.client.get("/api/compare?cities=Ranchi,Nowhereville")
        data = response.get_json()["data"]
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(data["cities"]), 1)
        self.assertEqual(data["failed"][0]["query"], "Nowhereville")
        self.assertEqual(data["failed"][0]["error"]["code"], "LOCATION_NOT_FOUND")
        self.assertIsNone(data["summary"])

    @patch("services.open_meteo.requests.get", side_effect=make_fake_get())
    def test_compare_all_cities_fail(self, mock_get):
        response = self.client.get("/api/compare?cities=Nowhereville,Nowherestan")
        self.assertEqual(response.status_code, 404)
        self.assertFalse(response.get_json()["success"])

    @patch("services.open_meteo.requests.get",
           side_effect=requests.exceptions.Timeout())
    def test_compare_timeout(self, mock_get):
        response = self.client.get("/api/compare?cities=Ranchi,Delhi")
        self.assertEqual(response.status_code, 504)

    # ---------- assistant: umbrella / rain ----------
    def test_umbrella_yes(self):
        response = self.ask("Do I need an umbrella today?",
                            build_payload(rain={16: 80}))
        data = response.get_json()["data"]
        self.assertEqual(response.status_code, 200)
        self.assertEqual(data["intent"], "umbrella")
        self.assertTrue(data["answer"].startswith("Yes"))
        self.assertEqual(data["facts"]["rain_chance_max"], 80)
        self.assertEqual(data["facts"]["peak_time"], "2026-11-25T16:00")

    def test_umbrella_no(self):
        response = self.ask("Should I carry an umbrella?", build_payload())
        data = response.get_json()["data"]
        self.assertTrue(data["answer"].startswith("No"))

    def test_rain_tomorrow(self):
        response = self.ask("Will it rain tomorrow?", build_payload(rain={34: 65}))
        data = response.get_json()["data"]
        self.assertEqual(data["intent"], "rain")
        self.assertEqual(data["window"], "tomorrow")
        self.assertEqual(data["facts"]["rain_chance_max"], 65)
        self.assertEqual(data["facts"]["peak_time"], "2026-11-26T10:00")
        self.assertIn("likely", data["answer"])

    # ---------- assistant: clothing / travel / general ----------
    def test_clothing_hot_and_cold(self):
        hot = self.ask("What should I wear today?", build_payload(temp=36.0))
        self.assertEqual(hot.get_json()["data"]["intent"], "clothing")
        self.assertIn("light", hot.get_json()["data"]["answer"])

        cold = self.ask("What should I wear today?", build_payload(temp=6.0))
        self.assertIn("jacket", cold.get_json()["data"]["answer"])

    def test_travel_warns_about_thunderstorm(self):
        response = self.ask("Is it safe to drive this evening?",
                            build_payload(codes={16: 95}))
        data = response.get_json()["data"]
        self.assertEqual(data["intent"], "travel")
        self.assertIn("thunderstorms", data["answer"])

    def test_travel_fine_weather(self):
        response = self.ask("Is it ok to travel today?", build_payload())
        self.assertIn("fine for travel", response.get_json()["data"]["answer"])

    def test_general_fallback_and_whole_word_matching(self):
        response = self.ask("What is the meaning of life?")
        data = response.get_json()["data"]
        self.assertEqual(data["intent"], "general")
        self.assertIn("umbrella", data["supported_topics"])

        # 'training' contains the letters 'rain' but is not the word 'rain'
        response = self.ask("How is my training going?")
        self.assertEqual(response.get_json()["data"]["intent"], "general")

    def test_assistant_with_coordinates(self):
        body = {"question": "Will it rain?", "latitude": 23.34, "longitude": 85.31}
        with patch("services.open_meteo.requests.get",
                   side_effect=make_fake_get(build_payload())):
            response = self.client.post("/api/assistant", json=body)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["data"]["location"]["latitude"], 23.34)

    # ---------- assistant: validation ----------
    def test_assistant_validation(self):
        post = self.client.post
        self.assertEqual(post("/api/assistant", json={"city": "Ranchi"}).status_code, 400)
        self.assertEqual(post("/api/assistant", json={"question": "Rain?"}).status_code, 400)
        self.assertEqual(
            post("/api/assistant", json={"question": "Rain?", "city": 5}).status_code, 400)
        self.assertEqual(
            post("/api/assistant", data="not json",
                 content_type="application/json").status_code, 400)
        long_question = "x" * 301
        self.assertEqual(
            post("/api/assistant",
                 json={"question": long_question, "city": "Ranchi"}).status_code, 400)

    def test_assistant_rejects_get(self):
        response = self.client.get("/api/assistant")
        self.assertEqual(response.status_code, 405)
        self.assertEqual(response.get_json()["error"]["code"], "METHOD_NOT_ALLOWED")

    @patch("services.open_meteo.requests.get",
           side_effect=requests.exceptions.ConnectionError())
    def test_assistant_upstream_failure(self, mock_get):
        response = self.client.post(
            "/api/assistant", json={"question": "Rain?", "city": "Ranchi"})
        self.assertEqual(response.status_code, 502)


if __name__ == "__main__":
    unittest.main()
