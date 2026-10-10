import os
import secrets
import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

from backend.auth import (
    validate_secret_value,
    initialize_security_config,
    INSECURE_PLACEHOLDERS,
    generate_token,
    verify_token
)
from backend.main import app


@pytest.fixture
def env_backup():
    """Fixture to back up and restore environment variables around each test."""
    original_env = dict(os.environ)
    yield
    os.environ.clear()
    os.environ.update(original_env)


class TestJWTConfigurationSecurity:

    # 1. Every placeholder listed in both example files is rejected
    def test_01_all_example_placeholders_rejected(self, env_backup):
        example_placeholders = [
            "your_system_secret_token_here",
            "your_dedicated_jwt_secret_key_here",
            "change_me_use_a_long_random_string",
            "change_me_use_a_separate_long_random_string",
            "your-secret-key",
            "your_secret_key",
            "jwt_secret_here",
            "your_jwt_secret_key",
            "secret",
            "change-me",
            "change_me",
            "default-secret",
            "default_secret",
            "123456",
            "password",
            "setu_legacy_system_token_2026",
            "dev-secret-key-change-in-production-12345678901234567890",
        ]

        for ph in example_placeholders:
            is_valid, reason = validate_secret_value(ph, min_length=32)
            assert not is_valid, f"Placeholder '{ph}' should be rejected but was accepted."
            assert "placeholder" in reason.lower() or "minimum" in reason.lower()

    # 2. Leading/trailing whitespace and case variations cannot bypass placeholder validation
    def test_02_whitespace_and_case_variations_rejected(self, env_backup):
        variations = [
            "   change_me_use_a_long_random_string   ",
            "CHANGE_ME_USE_A_LONG_RANDOM_STRING",
            "  Your_System_Secret_Token_Here  ",
            "YOUR_DEDICATED_JWT_SECRET_KEY_HERE\n",
            "\tsetu_legacy_system_token_2026\t",
        ]
        for var in variations:
            is_valid, reason = validate_secret_value(var, min_length=32)
            assert not is_valid, f"Variation '{var}' should be rejected."

    # 3. Secrets shorter than the required minimum (32 chars) are rejected
    def test_03_short_secrets_rejected(self, env_backup):
        short_secrets = [
            "short_secret",
            "a" * 31,
            "1234567890123456789012345678901",  # 31 chars
        ]
        for sec in short_secrets:
            is_valid, reason = validate_secret_value(sec, min_length=32)
            assert not is_valid, f"Short secret '{sec}' (len {len(sec)}) should be rejected."
            assert "minimum" in reason.lower() or "placeholder" in reason.lower()

    # 4. Missing secrets cause production startup/configuration validation to fail
    def test_04_missing_secrets_fail_production(self, env_backup):
        os.environ["ENVIRONMENT"] = "production"
        os.environ.pop("JWT_SECRET", None)
        os.environ.pop("SECRET_TOKEN", None)

        with pytest.raises(RuntimeError) as exc_info:
            initialize_security_config()
        assert "JWT_SECRET validation failed in production" in str(exc_info.value) or "missing" in str(exc_info.value).lower()

    # 5. Placeholder secrets cause production startup/configuration validation to fail
    def test_05_placeholder_secrets_fail_production(self, env_backup):
        os.environ["ENVIRONMENT"] = "production"
        os.environ["JWT_SECRET"] = "your_dedicated_jwt_secret_key_here"
        os.environ["SECRET_TOKEN"] = "change_me_use_a_long_random_string"

        with pytest.raises(RuntimeError) as exc_info:
            initialize_security_config()
        assert "validation failed in production" in str(exc_info.value)

    # 6. The known development JWT secret is rejected in production
    def test_06_dev_secret_rejected_in_production(self, env_backup):
        os.environ["ENVIRONMENT"] = "production"
        os.environ["JWT_SECRET"] = "dev-secret-key-change-in-production-12345678901234567890"
        os.environ["SECRET_TOKEN"] = "a" * 32

        with pytest.raises(RuntimeError) as exc_info:
            initialize_security_config()
        assert "JWT_SECRET validation failed in production" in str(exc_info.value)

    # 7. Identical SECRET_TOKEN and JWT_SECRET values are rejected in production
    def test_07_identical_secrets_rejected_in_production(self, env_backup):
        same_secret = "b" * 32
        os.environ["ENVIRONMENT"] = "production"
        os.environ["JWT_SECRET"] = same_secret
        os.environ["SECRET_TOKEN"] = same_secret

        with pytest.raises(RuntimeError) as exc_info:
            initialize_security_config()
        assert "must be distinct" in str(exc_info.value)

    # 8. Missing or unrecognized environment configuration cannot silently enable insecure development-secret fallback
    def test_08_unrecognized_environment_defaults_to_strict_production(self, env_backup):
        unrecognized_envs = ["", "xyz", "staging", "prod_test", "UNKNOWN"]
        for env_val in unrecognized_envs:
            if env_val:
                os.environ["ENVIRONMENT"] = env_val
            else:
                os.environ.pop("ENVIRONMENT", None)
                os.environ.pop("ENV", None)

            os.environ.pop("JWT_SECRET", None)
            os.environ.pop("SECRET_TOKEN", None)

            with pytest.raises(RuntimeError) as exc_info:
                initialize_security_config()
            assert "validation failed" in str(exc_info.value).lower()

    # 9. Valid, distinct secrets allow production configuration to initialize
    def test_09_valid_distinct_secrets_initialize_production(self, env_backup):
        valid_jwt_sec = "x" * 32
        valid_sys_sec = "y" * 32
        os.environ["ENVIRONMENT"] = "production"
        os.environ["JWT_SECRET"] = valid_jwt_sec
        os.environ["SECRET_TOKEN"] = valid_sys_sec

        st, jwt_sec, is_dev = initialize_security_config()
        assert not is_dev
        assert st == valid_sys_sec
        assert jwt_sec == valid_jwt_sec

    # 10. Development mode initializes with dev fallback when environment is explicitly development
    def test_10_dev_mode_initialization(self, env_backup):
        os.environ["ENVIRONMENT"] = "development"
        os.environ.pop("JWT_SECRET", None)
        os.environ.pop("SECRET_TOKEN", None)

        st, jwt_sec, is_dev = initialize_security_config()
        assert is_dev
        assert st is None
        assert jwt_sec == "dev-secret-key-change-in-production-12345678901234567890"
