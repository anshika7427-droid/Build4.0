import os
import sys
from dotenv import load_dotenv

# Add project root to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database.postgres_client import get_db_cursor

MIGRATION_STATEMENTS = """
-- Idempotent column additions for existing tables
ALTER TABLE needs_reports ADD COLUMN IF NOT EXISTS resource_type TEXT DEFAULT 'food';
ALTER TABLE needs_reports ADD COLUMN IF NOT EXISTS required_quantity INTEGER DEFAULT 0;
ALTER TABLE needs_reports ADD COLUMN IF NOT EXISTS fulfilled_quantity INTEGER DEFAULT 0;
ALTER TABLE needs_reports ADD COLUMN IF NOT EXISTS unit TEXT DEFAULT 'units';
ALTER TABLE needs_reports ADD COLUMN IF NOT EXISTS urgency TEXT DEFAULT 'medium';
ALTER TABLE volunteers ADD COLUMN IF NOT EXISTS vehicle TEXT;
"""

def init_schema():
    load_dotenv(dotenv_path="config/.env")
    sql_path = os.path.join("database", "schema.sql")
    
    if not os.path.exists(sql_path):
        print(f"Error: {sql_path} does not exist.")
        sys.exit(1)
        
    with open(sql_path, "r", encoding="utf-8") as f:
        schema_sql = f.read()
        
    print("[INFO] Connecting to Supabase PostgreSQL database and running schema initialization...", flush=True)
    try:
        with get_db_cursor(commit=True, dict_cursor=False) as cur:
            cur.execute(schema_sql)
            cur.execute(MIGRATION_STATEMENTS)
        print("[OK] SUCCESS: Supabase PostgreSQL connection verified and schema initialized successfully!")
    except Exception as e:
        print(f"[ERROR] Failed to connect or initialize database: {e}", flush=True)
        sys.exit(1)

if __name__ == "__main__":
    init_schema()
