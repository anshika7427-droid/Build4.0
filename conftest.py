import os

# Establish safe test configuration before any test module imports backend/auth.py or backend/main.py.
# This enables clean-environment testability without relying on an excluded .env file.
if not os.getenv("ENVIRONMENT") and not os.getenv("ENV"):
    os.environ["ENVIRONMENT"] = "testing"

if not os.getenv("JWT_SECRET"):
    os.environ["JWT_SECRET"] = "test-jwt-secret-key-32-characters-long-setu-2026"

if not os.getenv("SECRET_TOKEN"):
    os.environ["SECRET_TOKEN"] = "test-system-token-32-characters-long-setu-2026"
