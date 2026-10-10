import os
import psycopg2
from psycopg2 import pool
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv
from contextlib import contextmanager
from urllib.parse import urlparse, unquote

# Load configuration from config/.env
load_dotenv(dotenv_path="config/.env")

DATABASE_URL = os.getenv("SUPABASE_DB_URL")

_pool = None

from psycopg2.extensions import TRANSACTION_STATUS_IDLE

def safe_print(*args, **kwargs):
    try:
        print(*args, **kwargs)
    except Exception:
        pass

def get_pool():
    global _pool
    if _pool is None:
        if not DATABASE_URL:
            raise RuntimeError(
                "SUPABASE_DB_URL is not set. Please add it to your config/.env file."
            )
        try:
            safe_print("[INFO] Initializing PostgreSQL Connection Pool...", flush=True)
            
            # Robustly parse connection string to handle special characters (like '@') in passwords
            parsed = urlparse(DATABASE_URL)
            conn_params = {
                "user": unquote(parsed.username) if parsed.username else None,
                "password": unquote(parsed.password) if parsed.password else None,
                "host": parsed.hostname,
                "port": parsed.port or 5432,
                "database": parsed.path.lstrip('/') if parsed.path else None,
            }
            # Remove None values
            conn_params = {k: v for k, v in conn_params.items() if v is not None}
            
            # Set SSL mode if using a hosted database like Supabase
            # psycopg2 uses 'sslmode' connection parameter
            if "sslmode" in parsed.query:
                # Extract sslmode from query parameters if present
                from urllib.parse import parse_qs
                queries = parse_qs(parsed.query)
                if "sslmode" in queries:
                    conn_params["sslmode"] = queries["sslmode"][0]
            else:
                # Default to require ssl for cloud database URLs
                if parsed.hostname and not parsed.hostname.startswith(("localhost", "127.0.0.1")):
                    conn_params["sslmode"] = "require"

            try:
                # Threaded pool is safe for multi-threaded FastAPI servers
                _pool = psycopg2.pool.ThreadedConnectionPool(
                    minconn=2,
                    maxconn=20,
                    **conn_params
                )
                safe_print("[OK] PostgreSQL Connection Pool initialized successfully.", flush=True)
            except Exception as pool_err:
                # If pooler connection fails (e.g. IPv6/NAT64 SSL EOF on Windows), try direct host fallback
                if "pooler.supabase.com" in (conn_params.get("host") or ""):
                    user_val = conn_params.get("user", "")
                    proj_ref = user_val.split(".", 1)[1] if "." in user_val else None
                    if proj_ref:
                        safe_print("[INFO] Pooler connection failed. Falling back to direct Supabase host...", flush=True)
                        fallback_params = dict(conn_params)
                        fallback_params["host"] = f"db.{proj_ref}.supabase.co"
                        fallback_params["port"] = 5432
                        fallback_params["user"] = "postgres"
                        _pool = psycopg2.pool.ThreadedConnectionPool(
                            minconn=2,
                            maxconn=20,
                            **fallback_params
                        )
                        safe_print("[OK] PostgreSQL Connection Pool initialized via direct host fallback.", flush=True)
                    else:
                        raise pool_err
                else:
                    raise pool_err
        except Exception as e:
            safe_print(f"[ERROR] Failed to initialize connection pool: {e}", flush=True)
            raise e
    return _pool

@contextmanager
def get_db_connection():
    pool_obj = get_pool()
    conn = pool_obj.getconn()
    try:
        yield conn
    finally:
        if conn is not None:
            try:
                # Ensure connection is alive and healthy before returning to pool
                if hasattr(conn, "closed") and conn.closed == 0:
                    # Clean up any uncommitted, open, or aborted transaction
                    if hasattr(conn, "get_transaction_status"):
                        tx_status = conn.get_transaction_status()
                        if tx_status != TRANSACTION_STATUS_IDLE:
                            conn.rollback()
                    pool_obj.putconn(conn)
                else:
                    pool_obj.putconn(conn, close=True)
            except Exception:
                try:
                    pool_obj.putconn(conn, close=True)
                except Exception:
                    pass

@contextmanager
def get_db_cursor(commit=False, dict_cursor=True):
    """
    Helper context manager to fetch database cursor.
    Uses RealDictCursor by default to return records as standard Python dicts,
    ensuring compatibility with existing model formats.
    Guarantees transactions are committed or rolled back and cursors closed cleanly.
    """
    cursor_factory = RealDictCursor if dict_cursor else None
    with get_db_connection() as conn:
        cursor = conn.cursor(cursor_factory=cursor_factory)
        try:
            yield cursor
            if commit:
                conn.commit()
            else:
                # Cleanly finish read-only transaction so connection remains IDLE
                conn.rollback()
        except Exception as e:
            try:
                conn.rollback()
            except Exception:
                pass
            raise e
        finally:
            try:
                cursor.close()
            except Exception:
                pass
