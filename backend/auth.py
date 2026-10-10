import os
import secrets
from datetime import datetime, timezone, timedelta
import jwt
from typing import Optional, Tuple
from fastapi import HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv

# Load configuration
load_dotenv(dotenv_path="config/.env")
load_dotenv(dotenv_path=".env")

RAW_ENV = os.getenv("ENVIRONMENT") or os.getenv("ENV")
ENV_STR = RAW_ENV.strip().lower() if RAW_ENV and RAW_ENV.strip() else ""

DEV_ENVIRONMENTS = {"development", "dev", "local", "test", "testing"}
PROD_ENVIRONMENTS = {"production", "prod", "staging"}

IS_CLOUD_PROD = bool(os.getenv("K_SERVICE") or os.getenv("GAE_APPLICATION") or os.getenv("HEROKU_APP_NAME"))

if ENV_STR in DEV_ENVIRONMENTS or (not ENV_STR and not IS_CLOUD_PROD):
    IS_DEV_ENV = True
else:
    IS_DEV_ENV = False

INSECURE_PLACEHOLDERS = {
    "secret",
    "change-me",
    "change_me",
    "your-secret-key",
    "your_secret_key",
    "default-secret",
    "default_secret",
    "123456",
    "password",
    "jwt_secret_here",
    "your_jwt_secret_key",
    "your_jwt_secret_key_here",
    "your_system_secret_token_here",
    "your_dedicated_jwt_secret_key_here",
    "change_me_use_a_long_random_string",
    "change_me_use_a_separate_long_random_string",
    "setu_legacy_system_token_2026",
    "dev-secret-key-change-in-production-12345678901234567890",
}


def validate_secret_value(val: Optional[str], min_length: int = 32) -> Tuple[bool, str]:
    """
    Validates a secret key or token string against security rules:
    1. Must not be None, empty, or whitespace-only.
    2. Must not match any known placeholder (case-insensitive, trimmed).
    3. Must meet the minimum character length requirement (default 32 chars).
    Returns (is_valid: bool, reason: str).
    """
    if val is None:
        return False, "Secret is missing."
    cleaned = val.strip()
    if not cleaned:
        return False, "Secret is empty or whitespace."
    lowered = cleaned.lower()
    for placeholder in INSECURE_PLACEHOLDERS:
        if lowered == placeholder.lower():
            return False, f"Secret matches known insecure placeholder '{placeholder}'."
    if len(cleaned) < min_length:
        return False, f"Secret length ({len(cleaned)}) is below required minimum of {min_length} characters."
    return True, "Valid secret."


def initialize_security_config():
    """
    Initializes and validates security configuration according to environment safety rules:
    - Production/Strict Mode (unrecognized, unset, or explicit production environment):
      - Must have valid, distinct JWT_SECRET and SECRET_TOKEN (>=32 chars, not placeholders).
      - Fail startup with RuntimeError if validation fails.
    - Development/Test Mode (explicitly set to development, dev, local, test, testing):
      - Validates provided secrets, rejecting known placeholders.
      - Uses safe dev defaults for missing/placeholder JWT secrets while disabling invalid system tokens.
    """
    raw_env = os.getenv("ENVIRONMENT") or os.getenv("ENV")
    env_str = raw_env.strip().lower() if raw_env and raw_env.strip() else ""
    dev_environments = {"development", "dev", "local", "test", "testing"}
    
    is_dev = env_str in dev_environments

    raw_secret_token = os.getenv("SECRET_TOKEN")
    raw_jwt_secret = os.getenv("JWT_SECRET")

    is_valid_st, st_msg = validate_secret_value(raw_secret_token, min_length=32)
    is_valid_jwt, jwt_msg = validate_secret_value(raw_jwt_secret, min_length=32)

    if not is_dev:
        # Strict Production Mode
        if not is_valid_jwt:
            raise RuntimeError(f"JWT_SECRET validation failed in production: {jwt_msg}")
        if not is_valid_st:
            raise RuntimeError(f"SECRET_TOKEN validation failed in production: {st_msg}")
        if secrets.compare_digest(raw_secret_token.strip(), raw_jwt_secret.strip()):
            raise RuntimeError("SECRET_TOKEN and JWT_SECRET must be distinct secrets in production.")

        secret_token = raw_secret_token.strip()
        jwt_secret = raw_jwt_secret.strip()
    else:
        # Development / Test Mode
        st_cleaned = raw_secret_token.strip() if raw_secret_token and raw_secret_token.strip() else None
        jwt_cleaned = raw_jwt_secret.strip() if raw_jwt_secret and raw_jwt_secret.strip() else None

        if st_cleaned and st_cleaned.lower() in INSECURE_PLACEHOLDERS:
            secret_token = None
        else:
            secret_token = st_cleaned

        if jwt_cleaned and jwt_cleaned.lower() not in INSECURE_PLACEHOLDERS:
            jwt_secret = jwt_cleaned
        else:
            jwt_secret = "dev-secret-key-change-in-production-12345678901234567890"

    return secret_token, jwt_secret, is_dev


SECRET_TOKEN, JWT_SECRET, IS_DEV_ENV = initialize_security_config()
JWT_ALGORITHM = "HS256"

# Single shared security scheme for all routers
security = HTTPBearer(auto_error=False)


def generate_token(user_id: str, role: str, email: str) -> str:
    """
    Generate a signed JWT token for a user session.
    Expires in 24 hours.
    """
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "uid": str(user_id),
        "role": str(role).lower(),
        "email": str(email).strip().lower() if email else "",
        "iat": now,
        "exp": now + timedelta(hours=24)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def verify_token(credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)) -> dict:
    """
    FastAPI dependency — enforces Bearer token auth on any route.
    Supports standard JWT user sessions and static system SECRET_TOKEN when configured.
    Raises HTTP 401 if token is missing, expired, malformed, or invalid.
    """
    if not credentials or not credentials.credentials:
        raise HTTPException(status_code=401, detail="Missing authentication credentials.")

    token = credentials.credentials.strip()
    if not token:
        raise HTTPException(status_code=401, detail="Missing authentication credentials.")

    # 1. Server-to-server / system integration (using configured static SECRET_TOKEN)
    if SECRET_TOKEN is not None and isinstance(SECRET_TOKEN, str) and len(SECRET_TOKEN) > 0:
        if secrets.compare_digest(token, SECRET_TOKEN):
            return {
                "uid": "system",
                "sub": "system",
                "role": "system",
                "email": "system@setu.org"
            }

    # 2. Verify and decode standard JWT user session
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired. Please login again.")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token. Access denied.")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token. Access denied.")

    if not isinstance(payload, dict):
        raise HTTPException(status_code=401, detail="Invalid token payload.")

    uid = payload.get("uid") or payload.get("sub")
    role = payload.get("role")

    if not uid or not isinstance(uid, str):
        raise HTTPException(status_code=401, detail="Invalid token: missing or malformed identity claim.")

    if not role or not isinstance(role, str):
        raise HTTPException(status_code=401, detail="Invalid token: missing or malformed role claim.")

    allowed_roles = {"volunteer", "ngo", "system", "admin"}
    if role.lower() not in allowed_roles:
        raise HTTPException(status_code=401, detail=f"Unsupported role: '{role}'.")

    payload["uid"] = str(uid)
    payload["sub"] = str(uid)
    payload["role"] = str(role).lower()
    return payload


def optional_verify_token(credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)) -> Optional[dict]:
    """
    FastAPI dependency — optional Bearer token auth for public/coordinator feeds.
    Returns decoded token dictionary if valid token is provided.
    If no Authorization header is present, returns None.
    If a Bearer token IS supplied but is malformed, expired, or invalid, raises HTTP 401.
    """
    if not credentials or not credentials.credentials:
        return None
    return verify_token(credentials)


def require_roles(*allowed_roles):
    """
    FastAPI dependency factory enforcing that the authenticated user possesses one of the allowed roles.
    """
    def role_checker(token: dict = Depends(verify_token)) -> dict:
        user_role = token.get("role")
        if user_role not in allowed_roles:
            raise HTTPException(
                status_code=403,
                detail=f"Access denied: role '{user_role}' is not authorized for this action."
            )
        return token
    return role_checker
