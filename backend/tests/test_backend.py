"""Basic tests for Stage 1. Run with: python -m unittest discover tests"""
import os
import sqlite3
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app
from config import Config


class TestConfig(Config):
    TESTING = True


class BackendTests(unittest.TestCase):
    def setUp(self):
        self.temp_file = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        self.temp_file.close()
        TestConfig.DATABASE_PATH = self.temp_file.name
        self.app = create_app(TestConfig)
        self.client = self.app.test_client()

    def tearDown(self):
        os.remove(self.temp_file.name)

    def test_health_endpoint(self):
        response = self.client.get("/api/health")
        data = response.get_json()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(data["status"], "ok")
        self.assertEqual(data["database"], "connected")

    def test_cors_header_present(self):
        response = self.client.get(
            "/api/health", headers={"Origin": "http://localhost:3000"})
        self.assertIn("Access-Control-Allow-Origin", response.headers)

    def test_all_tables_created(self):
        expected = ["users", "saved_locations", "preferences",
                    "forecast_history", "community_reports"]
        connection = sqlite3.connect(self.temp_file.name)
        rows = connection.execute(
            "SELECT name FROM sqlite_master WHERE type='table'").fetchall()
        connection.close()
        found = []
        for row in rows:
            found.append(row[0])
        for table in expected:
            self.assertIn(table, found)


if __name__ == "__main__":
    unittest.main()
