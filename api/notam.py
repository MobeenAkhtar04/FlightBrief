import httpx
from typing import List, Optional
import re

AWC_NOTAM_URL = "https://aviationweather.gov/api/data/notam"


async def fetch_notams(icao: str, client: httpx.AsyncClient) -> List[dict]:
    try:
        resp = await client.get(
            AWC_NOTAM_URL,
            params={"icaoLocation": icao.upper(), "format": "json"},
            timeout=10.0,
        )
        resp.raise_for_status()
        data = resp.json()
        if not isinstance(data, list):
            return []
        notams = []
        for item in data[:25]:
            parsed = _parse_notam_item(item)
            if parsed:
                notams.append(parsed)
        return notams
    except httpx.TimeoutException:
        print(f"[notam] timeout for {icao}")
        return []
    except Exception as e:
        print(f"[notam] error for {icao}: {e}")
        return []


def _categorize_notam(text: str) -> str:
    t = text.upper()
    if any(w in t for w in ['RWY', 'RUNWAY']):
        return 'runway'
    if any(w in t for w in ['TWY', 'TAXIWAY']):
        return 'taxiway'
    if any(w in t for w in ['ILS', 'VOR', 'NDB', 'LOC ', 'DME', 'RNAV', 'GPS', 'NAVAID',
                              'GLIDESLOPE', 'GLIDE SLOPE', 'LOCALIZER', 'GLIDEPATH']):
        return 'navaid'
    if any(w in t for w in ['TFR', 'TEMPORARY FLIGHT RESTRICTION', 'RESTRICTED AREA',
                              'PROHIBITED AREA', 'AIRSPACE', 'CLASS B', 'CLASS C', 'CLASS D',
                              'MOA', 'RESTRICTED', 'PROHIBITED']):
        return 'airspace'
    if any(w in t for w in ['CRANE', 'TOWER', 'OBSTACLE', 'OBSTRUCTION', 'WIND TURBINE',
                              'ANTENNA', 'STRUCTURE']):
        return 'obstacle'
    if any(w in t for w in ['ODP', 'SID ', 'STAR ', 'APPROACH', 'DEPARTURE PROCEDURE',
                              'IAP ', 'INSTRUMENT APPROACH', 'PROCEDURE']):
        return 'procedure'
    if any(w in t for w in ['LIGHT', 'PAPI', 'REIL', 'VASI', 'LIGHTING', 'BEACON',
                              'STROBE', 'SEQUENCED']):
        return 'lighting'
    return 'other'


def _parse_notam_item(item: dict) -> Optional[dict]:
    if not item:
        return None
    props = item.get("properties", item)
    notam_id = props.get("notamNumber") or props.get("id") or "UNKNOWN"
    location = props.get("icaoLocation") or props.get("location") or ""
    text = (
        props.get("text") or
        props.get("traditionalMessage") or
        props.get("message") or
        ""
    )
    if not text:
        return None
    text = re.sub(r'\s+', ' ', text.strip())
    return {
        "id": str(notam_id),
        "location": location,
        "text": text,
        "category": _categorize_notam(text),
        "raw": item,
    }
