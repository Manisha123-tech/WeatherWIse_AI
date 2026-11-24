"""Consistent JSON responses and error handling for the whole API."""
from flask import jsonify
from werkzeug.exceptions import BadRequest


class ApiError(Exception):
    """An expected error, with a code and an HTTP status for the client."""

    def __init__(self, code, message, status_code=400):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code


def success_response(data, status_code=200):
    body = {"success": True, "data": data, "error": None}
    return jsonify(body), status_code


def error_response(code, message, status_code):
    body = {
        "success": False,
        "data": None,
        "error": {"code": code, "message": message},
    }
    return jsonify(body), status_code


def register_error_handlers(app):
    """Make every error (even unknown URLs) come back as JSON."""

    @app.errorhandler(ApiError)
    def handle_api_error(error):
        return error_response(error.code, error.message, error.status_code)

    @app.errorhandler(BadRequest)
    def handle_bad_request(error):
        return error_response("INVALID_REQUEST", "Invalid request.", 400)

    @app.errorhandler(404)
    def handle_not_found(error):
        return error_response("NOT_FOUND", "Endpoint not found.", 404)

    @app.errorhandler(405)
    def handle_method_not_allowed(error):
        return error_response(
            "METHOD_NOT_ALLOWED", "Method not allowed for this endpoint.", 405)

    @app.errorhandler(500)
    def handle_server_error(error):
        return error_response(
            "INTERNAL_ERROR", "Something went wrong on the server.", 500)
