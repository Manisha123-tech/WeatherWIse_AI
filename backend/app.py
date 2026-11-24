"""WeatherWise AI backend - main entry point."""
import os

from flask import Flask
from flask_cors import CORS

from config import Config
from database import db
from routes.accuracy import accuracy_bp
from routes.advisor import advisor_bp
from routes.alerts import alerts_bp
from routes.assistant import assistant_bp
from routes.auth import auth_bp
from routes.community import community_bp
from routes.compare import compare_bp
from routes.health import health_bp
from routes.location import location_bp
from routes.locations_saved import saved_locations_bp
from routes.preferences import preferences_bp
from routes.travel import travel_bp
from routes.weather import weather_bp
from utils.responses import register_error_handlers


def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)

    CORS(app, origins=app.config["CORS_ORIGINS"])

    db.init_app(app)
    register_error_handlers(app)

    app.register_blueprint(health_bp)
    app.register_blueprint(location_bp)
    app.register_blueprint(weather_bp)
    app.register_blueprint(compare_bp)
    app.register_blueprint(assistant_bp)
    app.register_blueprint(accuracy_bp)
    app.register_blueprint(community_bp)
    app.register_blueprint(advisor_bp)
    app.register_blueprint(travel_bp)
    app.register_blueprint(alerts_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(preferences_bp)
    app.register_blueprint(saved_locations_bp)

    return app


if __name__ == "__main__":
    app = create_app()
    port = int(os.environ.get("PORT", 5000))
    app.run(host="127.0.0.1", port=port, debug=app.config["DEBUG"])
