"""One-time migration to add new columns to events table."""
import os
import psycopg2

DATABASE_URL = os.environ.get("DATABASE_URL")

if not DATABASE_URL:
    print("DATABASE_URL not set")
    exit(1)

# Heroku uses postgres:// but psycopg2 needs postgresql://
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

conn = psycopg2.connect(DATABASE_URL)
cur = conn.cursor()

migrations = [
    "ALTER TABLE events ADD COLUMN IF NOT EXISTS end_month INTEGER",
    "ALTER TABLE events ADD COLUMN IF NOT EXISTS end_day INTEGER",
    "ALTER TABLE events ADD COLUMN IF NOT EXISTS color VARCHAR(7) DEFAULT '#ff6360'",
]

for sql in migrations:
    print(f"Running: {sql}")
    cur.execute(sql)

conn.commit()
cur.close()
conn.close()

print("Migration complete!")
