#!/usr/bin/env python3
"""Simple migration runner for SchoolPilot.

Reads .sql files from the migrations/ directory in sorted order and executes
them against the Supabase database. Tracks which migrations have been applied
in a _migrations table.

Usage:
    python migrate.py              # Apply pending migrations
    python migrate.py --status     # Show migration status
"""

import argparse
import glob
import logging
import os
import sys

from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

MIGRATIONS_DIR = os.path.join(os.path.dirname(__file__), "migrations")


def get_db():
    from supabase import create_client
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_KEY"]
    return create_client(url, key)


def ensure_migrations_table(db):
    """Create the _migrations tracking table if it doesn't exist."""
    db.rpc("exec_sql", {
        "query": """
        CREATE TABLE IF NOT EXISTS _migrations (
            id SERIAL PRIMARY KEY,
            filename TEXT UNIQUE NOT NULL,
            applied_at TIMESTAMPTZ DEFAULT now()
        );
        """
    }).execute()


def get_applied(db) -> set:
    try:
        result = db.table("_migrations").select("filename").execute()
        return {row["filename"] for row in (result.data or [])}
    except Exception:
        return set()


def apply_migration(db, filepath: str, filename: str):
    with open(filepath) as f:
        sql = f.read()

    logger.info("Applying migration: %s", filename)
    db.rpc("exec_sql", {"query": sql}).execute()
    db.table("_migrations").insert({"filename": filename}).execute()
    logger.info("Applied: %s", filename)


def main():
    parser = argparse.ArgumentParser(description="SchoolPilot database migrations")
    parser.add_argument("--status", action="store_true", help="Show migration status")
    args = parser.parse_args()

    db = get_db()

    try:
        ensure_migrations_table(db)
    except Exception:
        logger.warning("Could not create _migrations table (may need exec_sql RPC function)")

    applied = get_applied(db)
    migration_files = sorted(glob.glob(os.path.join(MIGRATIONS_DIR, "*.sql")))

    if args.status:
        for f in migration_files:
            name = os.path.basename(f)
            status = "applied" if name in applied else "pending"
            print(f"  [{status}] {name}")
        if not migration_files:
            print("  No migration files found.")
        return

    pending = [
        (f, os.path.basename(f))
        for f in migration_files
        if os.path.basename(f) not in applied
    ]

    if not pending:
        logger.info("All migrations are up to date.")
        return

    for filepath, filename in pending:
        try:
            apply_migration(db, filepath, filename)
        except Exception:
            logger.exception("Migration failed: %s", filename)
            sys.exit(1)

    logger.info("All %d pending migration(s) applied.", len(pending))


if __name__ == "__main__":
    main()
