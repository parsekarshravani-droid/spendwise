
import os
import logging

from flask import Flask, jsonify
from flask_cors import CORS
from werkzeug.exceptions import HTTPException

from models import db, migrate


def create_app(config=None):
    app = Flask(__name__)

    # Database configuration
    url = os.environ.get(
        "DATABASE_URL",
        "sqlite:///spendwise.db"
    )

    # Support older PostgreSQL URL formats
    if url.startswith("postgres://"):
        url = url.replace(
            "postgres://",
            "postgresql://",
            1
        )

    # Use the installed psycopg2 driver for PostgreSQL
    if url.startswith("postgresql://"):
        url = url.replace(
            "postgresql://",
            "postgresql+psycopg2://",
            1
        )

    app.config.update(
        SQLALCHEMY_DATABASE_URI=url,
        SQLALCHEMY_ENGINE_OPTIONS={
            "pool_pre_ping": True
        },
        MAX_CONTENT_LENGTH=5 * 1024 * 1024
    )

    # Apply optional configuration overrides
    if config:
        app.config.update(config)

    # CORS configuration
    origins = [
        origin.strip().rstrip("/")
        for origin in os.environ.get(
            "CORS_ORIGINS",
            "http://localhost:5173"
        ).split(",")
        if origin.strip()
    ]

    CORS(
        app,
        resources={
            r"/api/*": {
                "origins": origins
            }
        }
    )

    # Initialize database and migrations
    db.init_app(app)
    migrate.init_app(app, db)

    # Register API routes
    from routes import bp
    app.register_blueprint(bp)

    # HTTP error handler
    @app.errorhandler(HTTPException)
    def http_err(e):
        return jsonify({
            "error": e.description,
            "fields": {}
        }), e.code

    # General error handler
    @app.errorhandler(Exception)
    def server_err(e):
        logging.exception("Unhandled error")
        return jsonify({
            "error": "Something went wrong on the server.",
            "fields": {}
        }), 500

    return app


app = create_app()
