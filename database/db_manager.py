import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from config import DB_PATH


def _conn():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with _conn() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS expense_transactions (
                transaction_id TEXT PRIMARY KEY,
                transfer_date  DATE,
                amount         REAL,
                receiver_name  TEXT,
                category       TEXT,
                note           TEXT,
                slip_url       TEXT,
                attachment_url TEXT,
                status         TEXT DEFAULT 'pending',
                created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.commit()


def insert_transaction(data: dict):
    with _conn() as conn:
        conn.execute(
            """
            INSERT INTO expense_transactions
            (transaction_id, transfer_date, amount, receiver_name,
             category, note, slip_url, attachment_url, status)
            VALUES
            (:transaction_id, :transfer_date, :amount, :receiver_name,
             :category, :note, :slip_url, :attachment_url, :status)
            """,
            data,
        )
        conn.commit()


def get_verified_transactions() -> list:
    with _conn() as conn:
        rows = conn.execute(
            "SELECT * FROM expense_transactions WHERE status = 'verified' ORDER BY transfer_date"
        ).fetchall()
    return [dict(r) for r in rows]


def get_all_transactions(limit: int = 200) -> list:
    with _conn() as conn:
        rows = conn.execute(
            "SELECT * FROM expense_transactions ORDER BY created_at DESC LIMIT ?",
            (limit,),
        ).fetchall()
    return [dict(r) for r in rows]


def update_status(transaction_id: str, status: str):
    with _conn() as conn:
        conn.execute(
            "UPDATE expense_transactions SET status = ? WHERE transaction_id = ?",
            (status, transaction_id),
        )
        conn.commit()
