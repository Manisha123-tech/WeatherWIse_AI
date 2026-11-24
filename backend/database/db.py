"""SQLite connection helpers and idempotent schema migrations."""
import os
import sqlite3

from flask import current_app, g

SCHEMA_PATH = os.path.join(os.path.dirname(__file__), "schema.sql")

_MIGRATION_COLUMNS = {
    "saved_locations": [
        ("country", "TEXT"),
        ("admin1", "TEXT"),
    ],
    "preferences": [
        ("comfort_preference", "TEXT NOT NULL DEFAULT 'normal'"),
    ],
    "community_reports": [
        ("reporter_name", "TEXT NOT NULL DEFAULT 'Anonymous'"),
        ("location_name", "TEXT"),
        ("category", "TEXT NOT NULL DEFAULT 'rain'"),
        ("photo_reference", "TEXT"),
        ("moderation_status", "TEXT NOT NULL DEFAULT 'pending'"),
        ("verification_status", "TEXT NOT NULL DEFAULT 'unverified'"),
        ("moderator_note", "TEXT"),
        ("expires_at", "TEXT"),
        ("updated_at", "TEXT NOT NULL DEFAULT ''"),
    ],
}


def get_db():
    """Return the database connection for the current request."""
    if "db" not in g:
        db_path = current_app.config["DATABASE_PATH"]
        if db_path != ":memory:":
            parent_dir = os.path.dirname(db_path)
            if parent_dir:
                os.makedirs(parent_dir, exist_ok=True)
        g.db = sqlite3.connect(db_path)
        g.db.row_factory = sqlite3.Row            # rows behave like dictionaries
        g.db.execute("PRAGMA foreign_keys = ON")  # enforce relationships
    return g.db


def close_db(error=None):
    """Close the connection when the request ends."""
    db = g.pop("db", None)
    if db is not None:
        db.close()


def _apply_migrations(db):
    """Add any new columns to existing Stage 1 tables without losing data."""
    for table, columns in _MIGRATION_COLUMNS.items():
        existing = {
            row["name"]
            for row in db.execute(f"PRAGMA table_info({table})").fetchall()
        }
        for col_name, col_def in columns:
            if col_name not in existing:
                db.execute(f"ALTER TABLE {table} ADD COLUMN {col_name} {col_def}")


def init_db():
    """Create all tables from schema.sql (safe to run many times)."""
    db = get_db()
    with open(SCHEMA_PATH, "r", encoding="utf-8") as schema_file:
        db.executescript(schema_file.read())
    _apply_migrations(db)
    db.commit()


def init_app(app):
    """Connect the database helpers to the Flask app."""
    app.teardown_appcontext(close_db)
    with app.app_context():
        init_db()
