"""Stage 2 tests. Open-Meteo is mocked, so no internet is needed.

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


GEOCODE_PAYLOAD = {
    "results": [{
        "id": 1258980,
        "name": "Ranchi",
        "latitude": 23.34777,
        "longitude": 85.33786,
        "elevation": 651.0,
        "feature_code": "PPLA",
        "country_code": "IN",
        "timezone": "Asia/Kolkata",
        "population": 1073427,
        "country": "India",
        "admin1": "Jharkhand",
    }]
}


def build_forecast_payload():
    hourly_times = []
    for hour_number in range(48):
        day = 25 + hour_number // 24
        hour = hour_number % 24
        hourly_times.append("2026-11-%02dT%02d:00" % (day, hour))

    temperatures = []
    for hour_number in range(48):
        temperatures.append(20.0 + hour_number * 0.1)

    zeros = []
    for hour_number in range(48):
        zeros.append(0)

    daily_dates = ["2026-11-25", "2026-11-26", "2026-11-27", "2026-11-28",
                   "2026-11-29", "2026-11-30", "2026-12-01"]
    seven_values = [1, 2, 3, 4, 5, 6, 7]

    return {
        "timezone": "Asia/Kolkata",
        "current_units": {
            "temperature_2m": "\u00b0C", "relative_humidity_2m": "%",
            "wind_speed_10m": "km/h", "wind_direction_10m": "\u00b0",
            "precipitation": "mm",
        },
        "current": {
            "time": "2026-11-25T14:45",
            "temperature_2m": 24.1, "relative_humidity_2m": 48,
            "apparent_temperature": 23.5, "is_day": 1, "precipitation": 0.0,
            "weather_code": 1, "wind_speed_10m": 9.4, "wind_direction_10m": 270,
        },
        "hourly": {
            "time": hourly_times,
            "temperature_2m": temperatures,
            "apparent_temperature": temperatures,
            "relative_humidity_2m": zeros,
            "precipitation_probability": zeros,
            "precipitation": zeros,
            "weather_code": zeros,
            "wind_speed_10m": zeros,
        },
        "daily": {
            "time": daily_dates,
            "weather_code": seven_values,
            "temperature_2m_max": seven_values,
            "temperature_2m_min": seven_values,
            "apparent_temperature_max": seven_values,
            "apparent_temperature_min": seven_values,
            "sunrise": ["2026-11-25T06:05"] * 7,
            "sunset": ["2026-11-25T17:03"] * 7,
            "precipitation_sum": seven_values,
            "precipitation_probability_max": seven_values,
            "wind_speed_10m_max": seven_values,
        },
    }


def fake_get(url, params=None, timeout=None):
    if "geocoding" in url:
        if params["name"] == "Nowhereville":
            return FakeResponse(200, {"generationtime_ms": 0.5})
        return FakeResponse(200, GEOCODE_PAYLOAD)
    return FakeResponse(200, build_forecast_payload())


class WeatherTests(unittest.TestCase):
    def setUp(self):
        self.temp_file = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        self.temp_file.close()
        TestConfig.DATABASE_PATH = self.temp_file.name
        self.client = create_app(TestConfig).test_client()

    def tearDown(self):
        os.remove(self.temp_file.name)

    @patch("services.open_meteo.requests.get", side_effect=fake_get)
    def test_location_search(self, mock_get):
        response = self.client.get("/api/location?q=Ranchi")
        body = response.get_json()
        self.assertEqual(response.status_code, 200)
        self.assertTrue(body["success"])
        self.assertEqual(body["data"]["locations"][0]["display_name"],
                         "Ranchi, Jharkhand, India")

    @patch("services.open_meteo.requests.get", side_effect=fake_get)
    def test_location_not_found(self, mock_get):
        response = self.client.get("/api/location?q=Nowhereville")
        body = response.get_json()
        self.assertEqual(response.status_code, 404)
        self.assertFalse(body["success"])
        self.assertEqual(body["error"]["code"], "LOCATION_NOT_FOUND")

    def test_location_query_too_short(self):
        response = self.client.get("/api/location?q=R")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.get_json()["error"]["code"], "INVALID_REQUEST")

    @patch("services.open_meteo.requests.get", side_effect=fake_get)
    def test_weather_by_city(self, mock_get):
        response = self.client.get("/api/weather?city=Ranchi")
        data = response.get_json()["data"]
        self.assertEqual(response.status_code, 200)
        self.assertEqual(data["location"]["name"], "Ranchi")
        self.assertEqual(data["current"]["temperature"], 24.1)
        self.assertEqual(data["current"]["feels_like"], 23.5)
        self.assertEqual(data["current"]["condition"], "Mainly clear")
        self.assertEqual(data["today"]["sunrise"], "2026-11-25T06:05")
        self.assertEqual(data["units"]["temperature"], "\u00b0C")

    @patch("services.open_meteo.requests.get", side_effect=fake_get)
    def test_weather_by_coordinates(self, mock_get):
        response = self.client.get("/api/weather?latitude=23.34&longitude=85.31")
        data = response.get_json()["data"]
        self.assertEqual(response.status_code, 200)
        self.assertEqual(data["location"]["latitude"], 23.34)
        self.assertEqual(data["location"]["timezone"], "Asia/Kolkata")

    def test_weather_missing_inputs(self):
        response = self.client.get("/api/weather")
        self.assertEqual(response.status_code, 400)

    def test_weather_invalid_coordinates(self):
        response = self.client.get("/api/weather?latitude=999&longitude=85")
        self.assertEqual(response.status_code, 400)
        response = self.client.get("/api/weather?latitude=abc&longitude=85")
        self.assertEqual(response.status_code, 400)

    @patch("services.open_meteo.requests.get", side_effect=fake_get)
    def test_forecast_hourly_and_daily(self, mock_get):
        response = self.client.get("/api/forecast?city=Ranchi&hours=5")
        data = response.get_json()["data"]
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(data["hourly"]), 5)
        self.assertEqual(data["hourly"][0]["time"], "2026-11-25T14:00")
        self.assertEqual(len(data["daily"]), 7)
        self.assertEqual(data["daily"][0]["sunset"], "2026-11-25T17:03")

    def test_forecast_invalid_hours(self):
        response = self.client.get("/api/forecast?city=Ranchi&hours=500")
        self.assertEqual(response.status_code, 400)

    @patch("services.open_meteo.requests.get",
           side_effect=requests.exceptions.Timeout())
    def test_upstream_timeout(self, mock_get):
        response = self.client.get("/api/weather?city=Ranchi")
        self.assertEqual(response.status_code, 504)
        self.assertEqual(response.get_json()["error"]["code"], "UPSTREAM_TIMEOUT")

    @patch("services.open_meteo.requests.get",
           side_effect=requests.exceptions.ConnectionError())
    def test_upstream_unreachable(self, mock_get):
        response = self.client.get("/api/forecast?city=Ranchi")
        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.get_json()["error"]["code"], "UPSTREAM_UNAVAILABLE")

    def test_unknown_route_returns_json(self):
        response = self.client.get("/api/does-not-exist")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.get_json()["error"]["code"], "NOT_FOUND")


if __name__ == "__main__":
    unittest.main()
