"""Database migrations for circle calendar."""
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
    # Event columns (from previous migration)
    "ALTER TABLE events ADD COLUMN IF NOT EXISTS end_month INTEGER",
    "ALTER TABLE events ADD COLUMN IF NOT EXISTS end_day INTEGER",
    "ALTER TABLE events ADD COLUMN IF NOT EXISTS color VARCHAR(7) DEFAULT '#ff6360'",
    "ALTER TABLE events ADD COLUMN IF NOT EXISTS hidden BOOLEAN DEFAULT FALSE",

    # User birthday columns
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS birthday_month INTEGER",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS birthday_day INTEGER",

    # Friendships table (for future mutual birthday sharing)
    """
    CREATE TABLE IF NOT EXISTS friendships (
        id VARCHAR(36) PRIMARY KEY,
        requester_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        addressee_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(requester_id, addressee_id)
    )
    """,

    # Pending invitations table (for inviting non-users)
    """
    CREATE TABLE IF NOT EXISTS pending_invitations (
        id VARCHAR(36) PRIMARY KEY,
        inviter_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        invited_email VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(inviter_id, invited_email)
    )
    """,
]

for sql in migrations:
    print(f"Running: {sql.strip()[:60]}...")
    cur.execute(sql)

conn.commit()
cur.close()
conn.close()

print("Migration complete!")
