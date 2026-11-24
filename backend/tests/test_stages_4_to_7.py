"""Comprehensive tests for Stages 4-7: accuracy, community, rain, clothing, travel, alerts, cache, auth & preferences."""
from datetime import timedelta
import os
import sys
import tempfile
import unittest
from unittest.mock import patch

import requests

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app
from config import Config
from services import cache_service
from tests.test_stage3 import build_payload, make_fake_get


class TestConfig(Config):
    TESTING = True


class CacheEnabledConfig(Config):
    TESTING = True
    CACHE_ENABLED = True


class Stages4To7Tests(unittest.TestCase):
    def setUp(self):
        self.temp_file = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        self.temp_file.close()
        TestConfig.DATABASE_PATH = self.temp_file.name
        self.app = create_app(TestConfig)
        self.client = self.app.test_client()

    def tearDown(self):
        os.remove(self.temp_file.name)

    def _register_and_headers(self, username="alice", email="alice@example.com"):
        res = self.client.post(
            "/api/auth/register",
            json={"username": username, "email": email, "password": "password123"},
        )
        self.assertEqual(res.status_code, 201)
        token = res.get_json()["data"]["token"]
        return {"Authorization": f"Bearer {token}"}

    # ---------- Stage 3 extensions ----------
    @patch("services.open_meteo.requests.get", side_effect=make_fake_get())
    def test_compare_post_and_assistant_recommend_alias(self, mock_get):
        cmp_res = self.client.post(
            "/api/compare",
            json={"locations": [{"city": "Ranchi"}, {"latitude": 28.61, "longitude": 77.21}]},
        )
        self.assertEqual(cmp_res.status_code, 200)
        self.assertEqual(len(cmp_res.get_json()["data"]["cities"]), 2)

        rec_res = self.client.post(
            "/api/assistant/recommend",
            json={
                "question": "What should I wear today?",
                "city": "Ranchi",
                "preferences": {"comfort_preference": "cold_sensitive"},
            },
        )
        self.assertEqual(rec_res.status_code, 200)
        self.assertIn("disclaimer", rec_res.get_json()["data"])

    # ---------- Stage 4: Accuracy tracker ----------
    def test_accuracy_insufficient_data_then_available_metrics(self):
        # 2 snapshots + 2 observations -> below threshold (3) => insufficient_data
        for idx, (hour, pred, obs) in enumerate([
            ("2026-11-25T10:00", 24.0, 25.0),
            ("2026-11-25T11:00", 26.0, 24.0),
        ]):
            s = self.client.post("/api/accuracy/snapshots", json={
                "latitude": 23.35, "longitude": 85.33, "location_name": "Ranchi",
                "valid_time": hour, "predicted_temp": pred, "predicted_precip_mm": 1.0,
                "horizon_hours": idx + 1,
            })
            self.assertEqual(s.status_code, 201)
            o = self.client.post("/api/accuracy/observations", json={
                "latitude": 23.35, "longitude": 85.33,
                "observed_at": hour, "observed_temp": obs, "observed_precip_mm": 0.5,
            })
            self.assertEqual(o.status_code, 201)

        res_low = self.client.get("/api/accuracy/metrics?latitude=23.35&longitude=85.33")
        data_low = res_low.get_json()["data"]
        self.assertEqual(res_low.status_code, 200)
        self.assertEqual(data_low["status"], "insufficient_data")
        self.assertIsNone(data_low["reliability_score"])
        self.assertIsNone(data_low["within_2c_percent"])

        # Add 3rd matched pair -> meets threshold (3)
        self.client.post("/api/accuracy/snapshots", json={
            "latitude": 23.35, "longitude": 85.33, "location_name": "Ranchi",
            "valid_time": "2026-11-25T12:00", "predicted_temp": 27.0,
            "predicted_precip_mm": 0.0, "horizon_hours": 3,
        })
        self.client.post("/api/accuracy/observations", json={
            "latitude": 23.35, "longitude": 85.33,
            "observed_at": "2026-11-25T12:00", "observed_temp": 27.0, "observed_precip_mm": 0.0,
        })

        res_ok = self.client.get("/api/accuracy/metrics?latitude=23.35&longitude=85.33")
        data_ok = res_ok.get_json()["data"]
        self.assertEqual(data_ok["status"], "available")
        self.assertEqual(data_ok["sample_count"], 3)
        self.assertEqual(data_ok["temperature_mae"], 1.0)
        self.assertEqual(data_ok["within_2c_percent"], 100.0)
        self.assertEqual(data_ok["reliability_score"], 85.0)

    @patch("services.open_meteo.requests.get", side_effect=make_fake_get())
    def test_accuracy_live_snapshot_capture(self, mock_get):
        res = self.client.post("/api/accuracy/snapshots", json={"city": "Ranchi", "hours": 4})
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.get_json()["data"]["saved_count"], 4)

    # ---------- Stage 4: Community reports ----------
    def test_community_report_moderation_verification_and_photo_validation(self):
        bad_photo = self.client.post("/api/community/reports", json={
            "category": "heavy_rain",
            "description": "Heavy rain near Main Road",
            "latitude": 23.35,
            "longitude": 85.33,
            "photo_reference": "../../evil.exe",
        })
        self.assertEqual(bad_photo.status_code, 400)

        headers = self._register_and_headers()
        created = self.client.post(
            "/api/community/reports",
            headers=headers,
            json={
                "category": "waterlogging",
                "description": "Waterlogging near Station Road",
                "latitude": 23.35,
                "longitude": 85.33,
                "photo_reference": "street_flood.jpg",
            },
        )
        self.assertEqual(created.status_code, 201)
        report = created.get_json()["data"]
        self.assertEqual(report["moderation_status"], "pending")
        self.assertEqual(report["verification_status"], "unverified")

        # Pending reports should NOT appear in default approved listing
        pub_before = self.client.get("/api/community/reports").get_json()["data"]
        self.assertEqual(pub_before["count"], 0)

        # Moderate -> approved + verified
        mod = self.client.patch(
            f"/api/community/reports/{report['id']}/moderate",
            json={"moderation_status": "approved", "verification_status": "verified"},
        )
        self.assertEqual(mod.status_code, 200)
        self.assertEqual(mod.get_json()["data"]["moderation_status"], "approved")
        self.assertEqual(mod.get_json()["data"]["verification_status"], "verified")

        pub_after = self.client.get("/api/community/reports").get_json()["data"]
        self.assertEqual(pub_after["count"], 1)

        # Another user cannot delete alice's report
        other_headers = self._register_and_headers("bob", "bob@example.com")
        del_forbidden = self.client.delete(
            f"/api/community/reports/{report['id']}", headers=other_headers
        )
        self.assertEqual(del_forbidden.status_code, 403)

    # ---------- Stage 5: Rain estimator, clothing advisor, travel planner ----------
    def test_rain_estimate_with_and_without_rain(self):
        no_rain_payload = build_payload(rain={})
        # Override all probs to 0
        no_rain_payload["hourly"]["precipitation_probability"] = [0] * 48
        with patch("services.open_meteo.requests.get", side_effect=make_fake_get(no_rain_payload)):
            res_dry = self.client.get("/api/rain-estimate?city=Ranchi")
        d_dry = res_dry.get_json()["data"]
        self.assertEqual(res_dry.status_code, 200)
        self.assertFalse(d_dry["rain_expected"])
        self.assertTrue(d_dry["is_estimate"])
        self.assertIn("No rain is currently indicated", d_dry["summary"])

        rain_payload = build_payload(rain={16: 75, 17: 80})
        with patch("services.open_meteo.requests.get", side_effect=make_fake_get(rain_payload)):
            res_wet = self.client.get("/api/rain-estimate?city=Ranchi")
        d_wet = res_wet.get_json()["data"]
        self.assertTrue(d_wet["rain_expected"])
        self.assertEqual(d_wet["estimated_start"], "2026-11-25T16:00")
        self.assertEqual(d_wet["likely_duration_hours"], 2)

    def test_clothing_advisor(self):
        with patch("services.open_meteo.requests.get",
                   side_effect=make_fake_get(build_payload(temp=8.0, wind=35.0, rain={15: 65}))):
            res = self.client.post(
                "/api/advisor/clothing",
                json={"city": "Ranchi", "comfort_preference": "cold_sensitive", "temperature_unit": "fahrenheit"},
            )
        data = res.get_json()["data"]
        self.assertEqual(res.status_code, 200)
        self.assertEqual(data["weather_inputs"]["unit"], "°F")
        self.assertTrue(len(data["recommended_items"]) > 0)
        self.assertTrue(len(data["reasons"]) > 0)

    @patch("services.open_meteo.requests.get", side_effect=make_fake_get())
    def test_travel_analyze(self, mock_get):
        res = self.client.post("/api/travel/analyze", json={
            "origin": "Ranchi",
            "destination": "Mumbai",
            "departure_time": "2026-11-25T14:00",
            "estimated_duration_hours": 4,
            "waypoints": ["Delhi"],
        })
        data = res.get_json()["data"]
        self.assertEqual(res.status_code, 200)
        self.assertFalse(data["route_geometry_available"])
        self.assertIsNone(data["safety_claim"])
        self.assertEqual(len(data["checkpoints"]), 3)
        self.assertIn("uncertainty_note", data)

    # ---------- Stage 6: Alerts ----------
    def test_alerts_official_unavailable_vs_stored_and_advisories(self):
        with patch("services.open_meteo.requests.get",
                   side_effect=make_fake_get(build_payload(codes={16: 95}))):
            res1 = self.client.get("/api/alerts?city=Ranchi")
        d1 = res1.get_json()["data"]
        self.assertEqual(res1.status_code, 200)
        self.assertEqual(d1["official_feed_status"], "unavailable")
        self.assertEqual(d1["official_alerts"], [])
        self.assertTrue(len(d1["advisories"]) >= 1)
        self.assertFalse(d1["advisories"][0]["is_official"])

        now = cache_service.utc_now()
        stored = self.client.post("/api/alerts", json={
            "source": "IMD",
            "alert_type": "thunderstorm",
            "severity": "severe",
            "area": "Ranchi",
            "headline": "Thunderstorm warning for Ranchi",
            "issued_at": cache_service.to_iso(now - timedelta(hours=1)),
            "expires_at": cache_service.to_iso(now + timedelta(hours=5)),
        })
        self.assertEqual(stored.status_code, 201)

        with patch("services.open_meteo.requests.get", side_effect=make_fake_get()):
            res2 = self.client.get("/api/alerts?city=Ranchi")
        d2 = res2.get_json()["data"]
        self.assertEqual(d2["official_feed_status"], "available")
        self.assertEqual(len(d2["official_alerts"]), 1)
        self.assertTrue(d2["official_alerts"][0]["is_official"])

    # ---------- Stage 6: Auth, preferences and saved locations ----------
    @patch("services.open_meteo.requests.get", side_effect=make_fake_get())
    def test_preferences_and_saved_locations_user_isolation(self, mock_get):
        self.assertEqual(self.client.get("/api/preferences").status_code, 401)

        alice_h = self._register_and_headers("alice", "alice@example.com")
        bob_h = self._register_and_headers("bob", "bob@example.com")

        pref_put = self.client.put(
            "/api/preferences",
            headers=alice_h,
            json={"temperature_unit": "fahrenheit", "wind_speed_unit": "mph", "notifications_on": False},
        )
        self.assertEqual(pref_put.status_code, 200)
        self.assertEqual(pref_put.get_json()["data"]["temperature_unit"], "fahrenheit")

        saved = self.client.post(
            "/api/saved-locations",
            headers=alice_h,
            json={"city": "Ranchi"},
        )
        self.assertEqual(saved.status_code, 201)
        loc_id = saved.get_json()["data"]["id"]

        # Bob cannot see or delete Alice's saved location
        bob_list = self.client.get("/api/saved-locations", headers=bob_h).get_json()["data"]
        self.assertEqual(bob_list["count"], 0)
        self.assertEqual(
            self.client.delete(f"/api/saved-locations/{loc_id}", headers=bob_h).status_code,
            404,
        )

        # Alice can delete her own saved location
        self.assertEqual(
            self.client.delete(f"/api/saved-locations/{loc_id}", headers=alice_h).status_code,
            200,
        )

    # ---------- Stage 6: Cache and stale offline fallback ----------
    def test_cache_hit_refresh_and_stale_offline_fallback(self):
        temp_db = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        temp_db.close()
        try:
            CacheEnabledConfig.DATABASE_PATH = temp_db.name
            client = create_app(CacheEnabledConfig).test_client()

            # 1. Live fetch populates cache
            with patch("services.open_meteo.requests.get", side_effect=make_fake_get()) as m1:
                r1 = client.get("/api/weather?latitude=23.35&longitude=85.33")
                self.assertEqual(r1.status_code, 200)
                self.assertFalse(r1.get_json()["data"]["cached"])
                self.assertEqual(m1.call_count, 1)

            # 2. Second call uses fresh cache without calling requests.get
            with patch("services.open_meteo.requests.get", side_effect=make_fake_get()) as m2:
                r2 = client.get("/api/weather?latitude=23.35&longitude=85.33")
                self.assertEqual(r2.status_code, 200)
                self.assertTrue(r2.get_json()["data"]["cached"])
                self.assertFalse(r2.get_json()["data"]["stale"])
                self.assertEqual(m2.call_count, 0)

            # 3. ?refresh=true when offline falls back to stale cache with warning
            with patch("services.open_meteo.requests.get",
                       side_effect=requests.exceptions.ConnectionError()):
                r3 = client.get("/api/weather?latitude=23.35&longitude=85.33&refresh=true")
                self.assertEqual(r3.status_code, 200)
                d3 = r3.get_json()["data"]
                self.assertTrue(d3["cached"])
                self.assertTrue(d3["stale"])
                self.assertIn("warning", d3)
        finally:
            os.remove(temp_db.name)


if __name__ == "__main__":
    unittest.main()
