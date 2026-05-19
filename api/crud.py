"""
crud.py - database operations for briefings

nothing fancy, just raw SQL via asyncpg since we're not doing anything
complex enough to need a full ORM
"""

import json
import uuid
from datetime import datetime, timezone
from typing import Optional, List

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text


async def create_user(db: AsyncSession, username: str, password_hash: str) -> dict:
    stmt = text("""
        INSERT INTO users (username, password_hash)
        VALUES (:username, :password_hash)
        RETURNING id, username
    """)
    result = await db.execute(stmt, {"username": username, "password_hash": password_hash})
    await db.commit()
    row = result.fetchone()
    return {"id": str(row.id), "username": row.username}


async def get_user_by_username(db: AsyncSession, username: str) -> Optional[dict]:
    stmt = text("SELECT id, username, password_hash FROM users WHERE username = :username")
    result = await db.execute(stmt, {"username": username})
    row = result.fetchone()
    if not row:
        return None
    return {"id": str(row.id), "username": row.username, "password_hash": row.password_hash}


async def save_briefing(db: AsyncSession, brief_data: dict) -> str:
    """insert a new briefing record, returns the new UUID"""
    brief_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)  # keep as datetime object, not string — asyncpg needs it

    stmt = text("""
        INSERT INTO briefings (
            id, created_at, departure, arrival,
            distance_nm, bearing_deg, flight_time_hrs, fuel_burn_gal,
            departure_metar_raw, arrival_metar_raw,
            departure_flight_rules, arrival_flight_rules,
            decision, decision_reasons, full_brief
        ) VALUES (
            :id, :created_at, :departure, :arrival,
            :distance_nm, :bearing_deg, :flight_time_hrs, :fuel_burn_gal,
            :departure_metar_raw, :arrival_metar_raw,
            :departure_flight_rules, :arrival_flight_rules,
            :decision, :decision_reasons, :full_brief
        )
    """)

    dep_metar = brief_data.get("departure_metar") or {}
    arr_metar = brief_data.get("arrival_metar") or {}
    stats = brief_data.get("flight_stats") or {}

    await db.execute(stmt, {
        "id": brief_id,
        "created_at": now,
        "departure": brief_data["departure"],
        "arrival": brief_data["arrival"],
        "distance_nm": stats.get("distance_nm", 0),
        "bearing_deg": stats.get("bearing_deg", 0),
        "flight_time_hrs": stats.get("flight_time_hrs", 0),
        "fuel_burn_gal": stats.get("fuel_burn_gal", 0),
        "departure_metar_raw": dep_metar.get("raw", ""),
        "arrival_metar_raw": arr_metar.get("raw", ""),
        "departure_flight_rules": dep_metar.get("flight_rules", ""),
        "arrival_flight_rules": arr_metar.get("flight_rules", ""),
        "decision": brief_data.get("decision", ""),
        "decision_reasons": json.dumps(brief_data.get("decision_reasons", [])),
        "full_brief": json.dumps(brief_data),
    })
    await db.commit()
    return brief_id


async def get_briefings(
    db: AsyncSession,
    departure: Optional[str] = None,
    arrival: Optional[str] = None,
    limit: int = 50,
) -> List[dict]:
    """fetch past briefings, optionally filtered by airport pair"""

    where_clauses = []
    params = {"limit": limit}

    if departure:
        where_clauses.append("departure = :departure")
        params["departure"] = departure.upper()
    if arrival:
        where_clauses.append("arrival = :arrival")
        params["arrival"] = arrival.upper()

    where = ""
    if where_clauses:
        where = "WHERE " + " AND ".join(where_clauses)

    stmt = text(f"""
        SELECT id, created_at, departure, arrival,
               distance_nm, flight_time_hrs, decision,
               departure_flight_rules, arrival_flight_rules
        FROM briefings
        {where}
        ORDER BY created_at DESC
        LIMIT :limit
    """)

    result = await db.execute(stmt, params)
    rows = result.fetchall()

    return [
        {
            "id": str(row.id),
            "created_at": row.created_at.isoformat() if hasattr(row.created_at, 'isoformat') else str(row.created_at),
            "departure": row.departure,
            "arrival": row.arrival,
            "distance_nm": row.distance_nm,
            "flight_time_hrs": row.flight_time_hrs,
            "decision": row.decision,
            "departure_flight_rules": row.departure_flight_rules,
            "arrival_flight_rules": row.arrival_flight_rules,
        }
        for row in rows
    ]


async def get_briefing_by_id(db: AsyncSession, briefing_id: str) -> Optional[dict]:
    """fetch a single briefing with full detail"""
    stmt = text("""
        SELECT id, created_at, full_brief
        FROM briefings
        WHERE id = :id
    """)
    result = await db.execute(stmt, {"id": briefing_id})
    row = result.fetchone()

    if not row:
        return None

    full = row.full_brief if isinstance(row.full_brief, dict) else json.loads(row.full_brief)
    full["id"] = str(row.id)
    full["created_at"] = row.created_at.isoformat() if hasattr(row.created_at, 'isoformat') else str(row.created_at)
    return full
