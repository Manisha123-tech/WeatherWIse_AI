"""Edge-case and regression tests for WeatherWise AI backend."""
import os
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app
from config import Config, _parse_cors_origins
from services import assistant_service, weather_formatter


class TestConfig(Config):
    TESTING = True


class FakeResponse:
    def __init__(self, status_code, payload, bad_json=False):
        self.status_code = status_code
        self.payload = payload
        self.bad_json = bad_json

    def json(self):
        if self.bad_json:
            raise ValueError("Invalid JSON")
        return self.payload


class EdgeCaseTests(unittest.TestCase):
    def setUp(self):
        self.temp_file = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        self.temp_file.close()
        TestConfig.DATABASE_PATH = self.temp_file.name
        self.client = create_app(TestConfig).test_client()

    def tearDown(self):
        os.remove(self.temp_file.name)

    def test_cors_origins_parsing(self):
        self.assertEqual(_parse_cors_origins("*"), "*")
        self.assertEqual(_parse_cors_origins(""), "*")
        self.assertEqual(
            _parse_cors_origins("http://localhost:5173, http://localhost:3000"),
            ["http://localhost:5173", "http://localhost:3000"],
        )

    def test_boolean_and_non_finite_coordinates_rejected(self):
        with patch("services.open_meteo.requests.get") as mock_get:
            res_bool = self.client.post(
                "/api/assistant",
                json={"question": "Rain?", "latitude": True, "longitude": 85.0},
            )
            self.assertEqual(res_bool.status_code, 400)
            self.assertEqual(res_bool.get_json()["error"]["code"], "INVALID_REQUEST")

            for bad in ("nan", "inf", "-inf"):
                res_bad = self.client.get(f"/api/weather?latitude={bad}&longitude=85")
                self.assertEqual(res_bad.status_code, 400)
                self.assertEqual(res_bad.get_json()["error"]["code"], "INVALID_REQUEST")

            mock_get.assert_not_called()

    def test_partial_coordinates_rejected(self):
        self.assertEqual(self.client.get("/api/weather?latitude=23.34").status_code, 400)
        self.assertEqual(self.client.get("/api/weather?longitude=85.31").status_code, 400)

    def test_upstream_malformed_responses_return_502(self):
        bad_responses = [
            FakeResponse(500, {"error": True}),
            FakeResponse(200, None, bad_json=True),
            FakeResponse(200, ["unexpected", "list"]),
            FakeResponse(200, {"current": None, "hourly": {}, "daily": {}}),
        ]
        for fake in bad_responses:
            with patch("services.open_meteo.requests.get", return_value=fake):
                res = self.client.get("/api/weather?latitude=23.34&longitude=85.31")
                self.assertEqual(res.status_code, 502)
                self.assertEqual(res.get_json()["error"]["code"], "UPSTREAM_ERROR")

    def test_stale_hourly_data_returns_empty_not_past_hours(self):
        raw = {
            "current": {"time": "2026-11-28T10:00"},
            "hourly": {
                "time": ["2026-11-25T00:00", "2026-11-25T01:00"],
                "temperature_2m": [20.0, 21.0],
            },
            "daily": {"time": ["2026-11-28"]},
        }
        self.assertEqual(weather_formatter.format_hourly(raw, 12), [])

    def test_assistant_tomorrow_with_missing_daily_day_returns_502(self):
        raw = {
            "timezone": "Asia/Kolkata",
            "current_units": None,
            "current": {
                "time": "2026-11-25T14:00",
                "temperature_2m": 24.0,
                "apparent_temperature": 23.0,
                "relative_humidity_2m": 50,
                "wind_speed_10m": 10.0,
                "wind_direction_10m": 180,
                "precipitation": 0.0,
                "weather_code": 0,
                "is_day": 1,
            },
            "hourly": {
                "time": ["2026-11-25T14:00"],
                "temperature_2m": [24.0],
            },
            "daily": {
                "time": ["2026-11-25"],
            },
        }
        with patch("services.open_meteo.requests.get",
                   return_value=FakeResponse(200, raw)):
            res = self.client.post(
                "/api/assistant",
                json={"question": "Will it rain tomorrow?", "latitude": 23.34, "longitude": 85.31},
            )
            self.assertEqual(res.status_code, 502)
            self.assertEqual(res.get_json()["error"]["code"], "UPSTREAM_ERROR")

    def test_formatter_safety_on_unexpected_types(self):
        self.assertEqual(weather_formatter.describe_weather_code(True), "Unknown")
        self.assertEqual(weather_formatter.describe_weather_code({"bad": 1}), "Unknown")
        units = weather_formatter.build_units({"current_units": None})
        self.assertEqual(units["temperature"], "\u00b0C")

    def test_travel_answer_with_missing_rain_and_wind(self):
        stats = {
            "rain_chance_max": None,
            "peak_time": None,
            "precipitation_total": 0.0,
            "temp_min": 22.0,
            "temp_max": 24.0,
            "feels_like_min": 22.0,
            "feels_like_max": 24.0,
            "wind_max": None,
            "thunderstorm": False,
            "heavy_rain": False,
            "fog": False,
        }
        text = assistant_service.answer_travel("in the next 12 hours", stats, "Ranchi")
        self.assertNotIn("unknown%", text)
        self.assertIn("Conditions look fine for travel", text)

    def test_health_endpoint_reports_error_when_db_fails(self):
        with patch("routes.health.get_db", side_effect=RuntimeError("DB down")):
            res = self.client.get("/api/health")
            data = res.get_json()
            self.assertEqual(res.status_code, 500)
            self.assertEqual(data["status"], "error")
            self.assertEqual(data["database"], "error")


if __name__ == "__main__":
    unittest.main()
