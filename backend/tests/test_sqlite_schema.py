import sqlite3
from pathlib import Path

from app.main import app  # noqa: F401 - importing triggers table creation


def test_sqlite_schema_contains_auth_tables():
    db_path = Path("ar_support.db")
    assert db_path.exists(), "Expected SQLite database file to be created"

    conn = sqlite3.connect(str(db_path))
    try:
        table_rows = conn.execute(
            "select name from sqlite_master where type=? order by name",
            ("table",),
        ).fetchall()
    finally:
        conn.close()

    table_names = {row[0] for row in table_rows}
    assert "users" in table_names
    assert "auth_tokens" in table_names
