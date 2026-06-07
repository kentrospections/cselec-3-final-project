#!/bin/bash
set -e

echo "==> Running database migrations..."
uv run alembic upgrade head

echo "==> Checking if database needs seeding..."
NEEDS_SEED=$(uv run python - <<'PYEOF'
import asyncio, os
import asyncpg
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path("/app/.env"))
raw = os.environ.get("DATABASE_URL", "postgresql://postgres:password@db:5432/analytics")
dsn = raw.replace("postgresql+asyncpg://", "postgresql://")

async def check():
    conn = await asyncpg.connect(dsn)
    count = await conn.fetchval("SELECT COUNT(*) FROM students")
    await conn.close()
    return count

count = asyncio.run(check())
print("1" if count == 0 else "0")
PYEOF
)

if [ "$NEEDS_SEED" = "1" ]; then
    echo "==> No students found — running seed script (this will take a few minutes)..."
    uv run python scripts/seed.py
else
    echo "==> Database already seeded, skipping."
fi

echo "==> Starting API server..."
exec uv run uvicorn app.main:app --host 0.0.0.0 --port 8000
