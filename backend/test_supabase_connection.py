
import psycopg
from getpass import getpass

print("=== Family Roots Supabase Connection Test ===")

host = input("Session Pooler host: ").strip()
port = int(input("Session Pooler port: ").strip())
dbname = input("Database name: ").strip()
user = input("Session Pooler username: ").strip()
password = getpass("Database password (hidden): ")

try:
    with psycopg.connect(
        host=host,
        port=port,
        dbname=dbname,
        user=user,
        password=password,
        sslmode="require",
        connect_timeout=15
    ) as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT current_database(), current_user, version()
            """)

            result = cur.fetchone()

            print("\nCONNECTION SUCCESSFUL")
            print("Database:", result[0])
            print("User:", result[1])
            print("PostgreSQL:", result[2].split(",")[0])

            cur.execute("""
                SELECT COUNT(*)
                FROM information_schema.tables
                WHERE table_schema = 'public'
            """)

            print("Existing public tables:", cur.fetchone()[0])

except Exception as exc:
    print("\nCONNECTION FAILED")
    print(type(exc).__name__, str(exc))
