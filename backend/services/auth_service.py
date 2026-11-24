"""Authentication helpers using password hashing and signed bearer tokens."""
import re

from flask import current_app, request
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from werkzeug.security import check_password_hash, generate_password_hash

from database.db import get_db
from utils.responses import ApiError

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
USERNAME_RE = re.compile(r"^[A-Za-z0-9_.-]{3,32}$")


def _serializer():
    return URLSafeTimedSerializer(
        current_app.config["SECRET_KEY"], salt="weatherwise-auth"
    )


def issue_token(user_id):
    return _serializer().dumps({"user_id": int(user_id)})


def verify_token(token):
    max_age = int(current_app.config.get("TOKEN_MAX_AGE_SECONDS", 86400 * 7))
    try:
        data = _serializer().loads(token, max_age=max_age)
    except SignatureExpired:
        raise ApiError("UNAUTHORIZED", "Authentication token has expired.", 401)
    except BadSignature:
        raise ApiError("UNAUTHORIZED", "Invalid authentication token.", 401)

    user_id = data.get("user_id") if isinstance(data, dict) else None
    if not isinstance(user_id, int):
        raise ApiError("UNAUTHORIZED", "Invalid authentication token.", 401)
    return user_id


def get_optional_user():
    """Return user dict if a valid Bearer token is present, None if omitted."""
    auth_header = request.headers.get("Authorization", "").strip()
    if not auth_header:
        return None
    if not auth_header.lower().startswith("bearer "):
        raise ApiError("UNAUTHORIZED", "Use 'Authorization: Bearer <token>'.", 401)
    token = auth_header[7:].strip()
    if not token:
        raise ApiError("UNAUTHORIZED", "Authentication token is missing.", 401)

    user_id = verify_token(token)
    row = get_db().execute(
        "SELECT id, username, email, created_at FROM users WHERE id = ?",
        (user_id,),
    ).fetchone()
    if row is None:
        raise ApiError("UNAUTHORIZED", "User account no longer exists.", 401)
    return dict(row)


def require_user():
    """Require an authenticated user for private endpoints."""
    user = get_optional_user()
    if user is None:
        raise ApiError("UNAUTHORIZED", "Authentication required.", 401)
    return user


def register_user(username, email, password):
    if not isinstance(username, str) or not USERNAME_RE.match(username.strip()):
        raise ApiError(
            "INVALID_REQUEST",
            "'username' must be 3-32 characters (letters, numbers, _, ., -).",
            400,
        )
    if not isinstance(email, str) or not EMAIL_RE.match(email.strip()):
        raise ApiError("INVALID_REQUEST", "'email' must be a valid email address.", 400)
    if not isinstance(password, str) or len(password) < 6 or len(password) > 128:
        raise ApiError(
            "INVALID_REQUEST",
            "'password' must be between 6 and 128 characters.",
            400,
        )

    clean_username = username.strip()
    clean_email = email.strip().lower()
    pw_hash = generate_password_hash(password)

    db = get_db()
    existing = db.execute(
        "SELECT id FROM users WHERE lower(username) = lower(?) OR lower(email) = lower(?)",
        (clean_username, clean_email),
    ).fetchone()
    if existing is not None:
        raise ApiError("CONFLICT", "Username or email is already registered.", 409)

    cursor = db.execute(
        "INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)",
        (clean_username, clean_email, pw_hash),
    )
    user_id = cursor.lastrowid
    db.execute("INSERT INTO preferences (user_id) VALUES (?)", (user_id,))
    db.commit()

    user = dict(
        db.execute(
            "SELECT id, username, email, created_at FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
    )
    return {"user": user, "token": issue_token(user_id)}


def authenticate_user(identifier, password):
    if not isinstance(identifier, str) or not identifier.strip():
        raise ApiError("INVALID_REQUEST", "Provide 'username' or 'email'.", 400)
    if not isinstance(password, str) or not password:
        raise ApiError("INVALID_REQUEST", "Provide 'password'.", 400)

    clean_id = identifier.strip()
    row = get_db().execute(
        """
        SELECT id, username, email, password_hash, created_at
        FROM users
        WHERE lower(username) = lower(?) OR lower(email) = lower(?)
        """,
        (clean_id, clean_id),
    ).fetchone()

    if row is None or not check_password_hash(row["password_hash"], password):
        raise ApiError("UNAUTHORIZED", "Invalid credentials.", 401)

    user = {
        "id": row["id"],
        "username": row["username"],
        "email": row["email"],
        "created_at": row["created_at"],
    }
    return {"user": user, "token": issue_token(row["id"])}
