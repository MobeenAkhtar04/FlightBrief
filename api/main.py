"""
main.py - FlightBrief FastAPI application

endpoints:
  POST /brief           - generate a new briefing
  GET  /briefings       - list past briefings
  GET  /briefings/{id}  - single briefing detail
  GET  /health          - healthcheck

data sources: Aviation Weather Center (no API key needed)
"""

import asyncio
import json
import math
import re
import uuid
from contextlib import asynccontextmanager
from datetime import date, datetime, timezone
from typing import Optional

import httpx
from fastapi import FastAPI, HTTPException, Depends, Query, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession

import nav_bridge
from database import get_db, init_db
from schemas import BriefRequest, BriefResponse, BriefingSummary, UserCreate, Token
from metar import parse_metar, metar_to_dict
from taf import parse_taf, taf_to_dict
from notam import fetch_notams
from security import get_current_user, hash_password, verify_password, create_access_token
import crud

AWC_BASE    = "https://aviationweather.gov/api/data"
METAR_URL   = f"{AWC_BASE}/metar"
TAF_URL     = f"{AWC_BASE}/taf"
AIRPORT_URL = f"{AWC_BASE}/airport"


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(title="FlightBrief API", version="0.2.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── weather fetchers ─────────────────────────────────────────────────────────

async def fetch_metar(icao: str, client: httpx.AsyncClient) -> Optional[str]:
    try:
        r = await client.get(METAR_URL, params={"ids": icao, "format": "raw"}, timeout=8.0)
        r.raise_for_status()
        txt = r.text.strip()
        for line in txt.splitlines():
            line = line.strip()
            if line and (line.startswith(icao) or "METAR" in line or "SPECI" in line):
                return line
        lines = [l.strip() for l in txt.splitlines() if l.strip()]
        if lines:
            return lines[0]
    except Exception:
        pass
    try:
        r = await client.get(METAR_URL, params={"ids": icao, "format": "json"}, timeout=8.0)
        r.raise_for_status()
        data = r.json()
        if isinstance(data, list) and data:
            raw = data[0].get("rawOb") or data[0].get("raw")
            if raw:
                return str(raw).strip()
    except Exception as e:
        print(f"[metar] error {icao}: {e}")
    return None


async def fetch_taf(icao: str, client: httpx.AsyncClient) -> Optional[str]:
    try:
        r = await client.get(TAF_URL, params={"ids": icao, "format": "raw"}, timeout=8.0)
        r.raise_for_status()
        text = r.text.strip()
        return text if text else None
    except Exception as e:
        print(f"[taf] error {icao}: {e}")
        return None


async def fetch_airport_info(icao: str, client: httpx.AsyncClient) -> Optional[tuple]:
    """returns (lat, lon, elev_ft) or None"""
    try:
        r = await client.get(AIRPORT_URL, params={"ids": icao}, timeout=8.0)
        r.raise_for_status()
        txt = r.text
        lat_m = re.search(r'Latitude:\s*([-\d.]+)', txt)
        lon_m = re.search(r'Longitude:\s*([-\d.]+)', txt)
        elev_m = re.search(r'Elevation:\s*([-\d.]+)', txt)
        if lat_m and lon_m:
            elev_ft = int(float(elev_m.group(1)) * 3.28084) if elev_m else None
            return float(lat_m.group(1)), float(lon_m.group(1)), elev_ft
    except Exception:
        pass
    try:
        r = await client.get(METAR_URL, params={"ids": icao, "format": "json"}, timeout=8.0)
        r.raise_for_status()
        data = r.json()
        if isinstance(data, list) and data:
            obs = data[0]
            lat = obs.get("lat") or obs.get("latitude")
            lon = obs.get("lon") or obs.get("longitude")
            elev = obs.get("elev")
            if lat is not None and lon is not None:
                elev_ft = int(float(elev) * 3.28084) if elev is not None else None
                return float(lat), float(lon), elev_ft
    except Exception as e:
        print(f"[coords] error {icao}: {e}")
    return None


async def fetch_airsigmets(
    lat1: float, lon1: float, lat2: float, lon2: float,
    client: httpx.AsyncClient,
) -> list:
    # expand bbox by 3 degrees around the route
    min_lat = min(lat1, lat2) - 3.0
    max_lat = max(lat1, lat2) + 3.0
    min_lon = min(lon1, lon2) - 3.0
    max_lon = max(lon1, lon2) + 3.0
    try:
        r = await client.get(
            f"{AWC_BASE}/airsigmet",
            params={
                "format": "json",
                "bbox": f"{min_lat},{min_lon},{max_lat},{max_lon}",
            },
            timeout=8.0,
        )
        r.raise_for_status()
        data = r.json()
        if not isinstance(data, list):
            return []
        results = []
        for item in data:
            raw_text = (
                item.get("rawAirSigmet") or
                item.get("raw") or
                item.get("text") or ""
            )
            if not raw_text:
                continue
            results.append({
                "type": item.get("airSigmetType") or item.get("type") or "SIGMET",
                "hazard": item.get("hazard") or "UNKNOWN",
                "raw": raw_text.strip(),
                "valid_from": item.get("validTimeFrom"),
                "valid_to": item.get("validTimeTo"),
            })
        return results[:20]
    except Exception as e:
        print(f"[airsigmet] error: {e}")
        return []


async def fetch_pireps(lat1: float, lon1: float, lat2: float, lon2: float,
                       client: httpx.AsyncClient) -> list:
    min_lat = min(lat1, lat2) - 1.5
    max_lat = max(lat1, lat2) + 1.5
    min_lon = min(lon1, lon2) - 1.5
    max_lon = max(lon1, lon2) + 1.5
    try:
        r = await client.get(
            f"{AWC_BASE}/pirep",
            params={
                "format": "json",
                "bbox": f"{min_lat},{min_lon},{max_lat},{max_lon}",
            },
            timeout=8.0,
        )
        r.raise_for_status()
        data = r.json()
        if not isinstance(data, list):
            return []
        results = []
        for item in data[:15]:
            raw = item.get("rawOb") or item.get("raw") or ""
            if not raw:
                continue
            alt = item.get("altitude") or item.get("fltLvl")
            try:
                alt_ft = int(float(alt)) if alt is not None else None
            except (ValueError, TypeError):
                alt_ft = None
            tb_map = {
                0: None, 1: "Smooth", 2: "Light", 3: "Light-Moderate",
                4: "Moderate", 5: "Moderate-Severe", 6: "Severe", 7: "Extreme",
            }
            ice_map = {
                0: None, 1: "Trace", 2: "Light", 3: "Moderate", 4: "Severe",
            }
            tb_raw = item.get("tbInt")
            ice_raw = item.get("icgInt")
            try:
                turb = tb_map.get(int(tb_raw)) if tb_raw is not None else None
            except (ValueError, TypeError):
                turb = None
            try:
                icing = ice_map.get(int(ice_raw)) if ice_raw is not None else None
            except (ValueError, TypeError):
                icing = None
            temp = item.get("temp")
            try:
                temp_c = int(float(temp)) if temp is not None else None
            except (ValueError, TypeError):
                temp_c = None
            results.append({
                "raw": raw.strip(),
                "location": item.get("icaoId") or item.get("stationId"),
                "altitude_ft": alt_ft,
                "turbulence": turb,
                "icing": icing,
                "temperature_c": temp_c,
                "sky_condition": item.get("skyCondition"),
            })
        return results
    except Exception as e:
        print(f"[pirep] error: {e}")
        return []


async def fetch_winds_aloft(dep: str, arr: str, client: httpx.AsyncClient) -> dict:
    try:
        r = await client.get(
            f"{AWC_BASE}/windtemp",
            params={"region": "all", "level": "low", "fcst": "06"},
            timeout=10.0,
        )
        r.raise_for_status()
        return _parse_winds_aloft_text(r.text, dep, arr)
    except Exception as e:
        print(f"[winds_aloft] error: {e}")
        return {"dep": [], "arr": []}


def _parse_winds_aloft_text(text: str, dep_icao: str, arr_icao: str) -> dict:
    lines = text.strip().splitlines()
    altitudes = []
    header_idx = -1
    for i, line in enumerate(lines):
        nums = re.findall(r'\b(\d{4,5})\b', line)
        parsed = [int(n) for n in nums if 3000 <= int(n) <= 45000]
        if len(parsed) >= 3:
            altitudes = parsed
            header_idx = i
            break

    if not altitudes or header_idx < 0:
        return {"dep": [], "arr": []}

    def station_key(icao: str) -> str:
        s = icao.upper()
        if s.startswith(('K', 'P', 'C')):
            s = s[1:]
        return s[:3]

    dep_key = station_key(dep_icao)
    arr_key = station_key(arr_icao)
    dep_levels: list = []
    arr_levels: list = []

    for line in lines[header_idx + 1:]:
        parts = line.split()
        if not parts or len(parts[0]) != 3:
            continue
        station = parts[0].upper()
        target = None
        if station == dep_key:
            target = dep_levels
        elif station == arr_key:
            target = arr_levels
        if target is None:
            continue
        for i, group in enumerate(parts[1:]):
            if i >= len(altitudes):
                break
            parsed = _parse_wind_group(group, altitudes[i])
            if parsed:
                target.append(parsed)

    return {"dep": dep_levels, "arr": arr_levels}


def _parse_wind_group(group: str, alt_ft: int) -> Optional[dict]:
    if not group or group in ('////','9999'):
        return None
    try:
        if group.startswith('99') and len(group) <= 4:
            return {"altitude_ft": alt_ft, "wind_dir": None, "wind_speed": 0, "temperature_c": None}
        m = re.match(r'^(\d{4})([+-]\d+)?$', group)
        if not m:
            return None
        wind_part = m.group(1)
        temp_part = m.group(2)
        dd_raw = int(wind_part[:2])
        ss = int(wind_part[2:4])
        temp = int(temp_part) if temp_part else None
        # high-speed encoding: dd > 36 means subtract 50, add 100 to speed
        if dd_raw > 36:
            dd_raw -= 50
            ss += 100
        wind_dir = dd_raw * 10 if dd_raw > 0 else None
        return {"altitude_ft": alt_ft, "wind_dir": wind_dir, "wind_speed": ss, "temperature_c": temp}
    except (ValueError, AttributeError):
        return None


# ─── calculations ─────────────────────────────────────────────────────────────

def classify_conditions(ceiling_ft: float, vis_sm: float) -> str:
    if ceiling_ft < 500 or vis_sm < 1.0:
        return 'LIFR'
    if ceiling_ft < 1000 or vis_sm < 3.0:
        return 'IFR'
    if ceiling_ft < 3000 or vis_sm < 5.0:
        return 'MVFR'
    return 'VFR'


def calc_density_altitude(temp_c: float, altimeter_inhg: float, elev_ft: float) -> int:
    pressure_alt = elev_ft + (29.92 - altimeter_inhg) * 1000
    isa_temp = 15.0 - 2.0 * (pressure_alt / 1000.0)
    da = pressure_alt + 120.0 * (temp_c - isa_temp)
    return int(da)


def sun_times_utc(lat: float, lon: float, d: date) -> tuple:
    """Returns (sunrise_str, sunset_str) in HHMM Z format, or (None, None)."""
    n = d.timetuple().tm_yday
    decl = math.radians(-23.45 * math.cos(math.radians(360 / 365 * (n + 10))))
    cos_ha_num = math.sin(math.radians(-0.833)) - math.sin(math.radians(lat)) * math.sin(decl)
    cos_ha_den = math.cos(math.radians(lat)) * math.cos(decl)
    if abs(cos_ha_den) < 1e-10:
        return None, None
    cos_ha = cos_ha_num / cos_ha_den
    if abs(cos_ha) > 1.0:
        return None, None
    ha = math.degrees(math.acos(cos_ha))
    solar_noon = 12.0 - lon / 15.0
    sunrise_h = solar_noon - ha / 15.0
    sunset_h = solar_noon + ha / 15.0

    def fmt(h: float) -> str:
        h = h % 24
        hh = int(h)
        mm = int(round((h - hh) * 60))
        if mm == 60:
            hh += 1
            mm = 0
        return f"{hh:02d}{mm:02d}Z"

    return fmt(sunrise_h), fmt(sunset_h)


def calc_fuel_status(
    usable_gal: float,
    fuel_flow_gph: float,
    flight_time_hrs: float,
    flight_rules: str,
) -> dict:
    burn_gal = fuel_flow_gph * flight_time_hrs
    required_reserve_min = 45.0
    reserve_gal = usable_gal - burn_gal
    reserve_min = (reserve_gal / fuel_flow_gph) * 60.0 if fuel_flow_gph > 0 else 0.0
    if reserve_min < 0:
        status = 'NOGO'
    elif reserve_min < required_reserve_min:
        status = 'LOW'
    else:
        status = 'OK'
    return {
        "usable_gal": round(usable_gal, 1),
        "burn_gal": round(burn_gal, 1),
        "reserve_gal": round(reserve_gal, 1),
        "reserve_min": round(reserve_min, 0),
        "required_reserve_min": required_reserve_min,
        "status": status,
    }


def make_go_no_go(
    flight_rules: str,
    approach_type: str,
    ceiling_ft: float,
    vis_sm: float,
    wind_speed: float,
    crosswind: float,
    fuel_status: Optional[dict] = None,
    has_alternate: bool = False,
    arr_ceiling: float = 99999,
    arr_vis: float = 10.0,
) -> tuple:
    reasons = []
    weather_decision = 'GO'

    if flight_rules == 'LIFR':
        weather_decision = 'NOGO'
        reasons.append(f'LIFR — ceiling {int(ceiling_ft)}ft / vis {vis_sm:.1f}SM below all minimums')
    elif flight_rules == 'IFR':
        if approach_type == 'visual':
            weather_decision = 'NOGO'
            reasons.append(f'IFR conditions — ceiling {int(ceiling_ft)}ft / vis {vis_sm:.1f}SM not suitable for visual approach')
        else:
            label = 'RNAV/GPS' if approach_type == 'rnav' else 'ILS'
            weather_decision = 'CAUTION'
            reasons.append(f'IFR conditions — {label} approach required (ceiling {int(ceiling_ft)}ft / vis {vis_sm:.1f}SM)')
    elif flight_rules == 'MVFR':
        weather_decision = 'CAUTION'
        reasons.append(f'MVFR — ceiling {int(ceiling_ft)}ft / vis {vis_sm:.1f}SM is marginal')

    # 1-2-3 rule: alternate required if arrival ceiling < 2000ft or vis < 3SM
    if arr_ceiling < 2000 or arr_vis < 3.0:
        if not has_alternate:
            if weather_decision == 'GO':
                weather_decision = 'CAUTION'
            reasons.append(
                f'Arrival weather marginal (ceil {int(arr_ceiling)}ft / {arr_vis:.1f}SM) — alternate airport recommended (1-2-3 rule)'
            )
        else:
            reasons.append('Alternate filed — good, arrival weather is below 1-2-3 rule minimums')

    wind_nogo = False
    if crosswind > 20:
        wind_nogo = True
        reasons.append(f'Crosswind {int(crosswind)}kts exceeds 20kt limit')
    elif crosswind > 15:
        reasons.append(f'Crosswind {int(crosswind)}kts is high')
    if wind_speed > 30:
        wind_nogo = True
        reasons.append(f'Wind speed {int(wind_speed)}kts is excessive')
    elif wind_speed > 20:
        reasons.append(f'Wind speed {int(wind_speed)}kts is strong')

    fuel_nogo = False
    if fuel_status:
        if fuel_status['status'] == 'NOGO':
            fuel_nogo = True
            reasons.append(
                f"Insufficient fuel — burn {fuel_status['burn_gal']}gal, only {fuel_status['usable_gal']}gal usable"
            )
        elif fuel_status['status'] == 'LOW':
            if weather_decision == 'GO':
                weather_decision = 'CAUTION'
            reasons.append(
                f"Low fuel reserve — {int(fuel_status['reserve_min'])}min remaining after arrival (need 45min)"
            )

    if wind_nogo or fuel_nogo:
        decision = 'NOGO'
    else:
        decision = weather_decision

    if not reasons:
        reasons.append('All conditions within normal limits')

    return decision, reasons


# ─── auth ─────────────────────────────────────────────────────────────────────

@app.post("/auth/register", response_model=Token, status_code=status.HTTP_201_CREATED)
async def register(body: UserCreate, db: AsyncSession = Depends(get_db)):
    existing = await crud.get_user_by_username(db, body.username)
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already taken")
    hashed = hash_password(body.password)
    await crud.create_user(db, body.username, hashed)
    return Token(access_token=create_access_token(body.username))


@app.post("/auth/login", response_model=Token)
async def login(form: OAuth2PasswordRequestForm = Depends(), db: AsyncSession = Depends(get_db)):
    user = await crud.get_user_by_username(db, form.username)
    if not user or not verify_password(form.password, user["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return Token(access_token=create_access_token(user["username"]))


# ─── main brief endpoint ──────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "nav_engine": "cpp" if nav_bridge.using_cpp() else "python",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.post("/brief")
async def create_brief(
    req: BriefRequest,
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(get_current_user),
):
    dep = req.departure
    arr = req.arrival
    alt = req.alternate

    async with httpx.AsyncClient() as client:
        tasks = [
            asyncio.create_task(fetch_metar(dep, client)),
            asyncio.create_task(fetch_metar(arr, client)),
            asyncio.create_task(fetch_taf(dep, client)),
            asyncio.create_task(fetch_taf(arr, client)),
            asyncio.create_task(fetch_airport_info(dep, client)),
            asyncio.create_task(fetch_airport_info(arr, client)),
            asyncio.create_task(fetch_notams(dep, client)),
            asyncio.create_task(fetch_notams(arr, client)),
        ]
        # alternate weather tasks (or None placeholders)
        if alt:
            tasks += [
                asyncio.create_task(fetch_metar(alt, client)),
                asyncio.create_task(fetch_taf(alt, client)),
            ]

        results = await asyncio.gather(*tasks, return_exceptions=True)

    def safe(val, default=None):
        return default if isinstance(val, Exception) else val

    raw_metar_dep = safe(results[0])
    raw_metar_arr = safe(results[1])
    raw_taf_dep   = safe(results[2])
    raw_taf_arr   = safe(results[3])
    info_dep      = safe(results[4])
    info_arr      = safe(results[5])
    notams_dep    = safe(results[6], [])
    notams_arr    = safe(results[7], [])
    raw_metar_alt = safe(results[8]) if alt else None
    raw_taf_alt   = safe(results[9]) if alt else None

    # parse METAR / TAF
    metar_dep = parse_metar(raw_metar_dep) if raw_metar_dep else None
    metar_arr = parse_metar(raw_metar_arr) if raw_metar_arr else None
    metar_alt = parse_metar(raw_metar_alt) if raw_metar_alt else None
    metar_dep_dict = metar_to_dict(metar_dep) if metar_dep else None
    metar_arr_dict = metar_to_dict(metar_arr) if metar_arr else None
    metar_alt_dict = metar_to_dict(metar_alt) if metar_alt else None

    taf_dep = parse_taf(raw_taf_dep) if raw_taf_dep else None
    taf_arr = parse_taf(raw_taf_arr) if raw_taf_arr else None
    taf_alt = parse_taf(raw_taf_alt) if raw_taf_alt else None
    taf_dep_dict = taf_to_dict(taf_dep) if taf_dep else None
    taf_arr_dict = taf_to_dict(taf_arr) if taf_arr else None
    taf_alt_dict = taf_to_dict(taf_alt) if taf_alt else None

    # deduplicate NOTAMs
    seen_ids: set = set()
    all_notams = []
    for n in (notams_dep + notams_arr):
        if n["id"] not in seen_ids:
            seen_ids.add(n["id"])
            all_notams.append(n)

    # coords / flight stats
    coords_dep = info_dep
    coords_arr = info_arr
    distance_nm = bearing_deg = flight_time_hrs = fuel_burn_gal = 0.0
    flight_time_display = "N/A"

    if coords_dep and coords_arr:
        lat1, lon1 = coords_dep[0], coords_dep[1]
        lat2, lon2 = coords_arr[0], coords_arr[1]
        distance_nm = nav_bridge.vincenty_distance(lat1, lon1, lat2, lon2)
        bearing_deg = nav_bridge.initial_bearing(lat1, lon1, lat2, lon2)
        ft = nav_bridge.flight_time(distance_nm, req.cruise_speed_kts)
        flight_time_hrs = ft.total_hours
        flight_time_display = f"{ft.hours}h {ft.minutes}m"
        fuel_burn_gal = nav_bridge.fuel_burn(distance_nm, req.cruise_speed_kts, req.fuel_flow_gph)

    # winds aloft + PIREPs + SIGMETs/AIRMETs — all need coords, fire together
    winds_data = {"dep": [], "arr": []}
    pireps_raw = []
    airsigmets_raw = []
    if coords_dep and coords_arr:
        async with httpx.AsyncClient() as c2:
            wa_raw, pireps_result, sigmet_result = await asyncio.gather(
                fetch_winds_aloft(dep, arr, c2),
                fetch_pireps(lat1, lon1, lat2, lon2, c2),
                fetch_airsigmets(lat1, lon1, lat2, lon2, c2),
                return_exceptions=True,
            )
            winds_data     = safe(wa_raw, {"dep": [], "arr": []})
            pireps_raw     = safe(pireps_result, [])
            airsigmets_raw = safe(sigmet_result, [])

    # go/no-go inputs
    ceil_dep = float(metar_dep.ceiling_ft or 99999) if metar_dep else 99999.0
    vis_dep  = float(metar_dep.visibility_sm or 10.0) if metar_dep else 10.0
    ceil_arr = float(metar_arr.ceiling_ft or 99999) if metar_arr else 99999.0
    vis_arr  = float(metar_arr.visibility_sm or 10.0) if metar_arr else 10.0
    wind_speed = float(metar_dep.wind_speed or 0) if metar_dep else 0.0
    crosswind = 0.0
    if metar_dep:
        crosswind = abs(nav_bridge.crosswind_component(
            float(metar_dep.wind_dir or 0),
            float(metar_dep.wind_speed or 0),
            bearing_deg,
        ))

    worst_ceil = min(ceil_dep, ceil_arr)
    worst_vis  = min(vis_dep, vis_arr)
    flight_rules = classify_conditions(worst_ceil, worst_vis)
    approach_type = req.approach_type or 'visual'

    # fuel status
    fuel_status_dict = None
    if req.usable_fuel_gal and flight_time_hrs > 0:
        fuel_status_dict = calc_fuel_status(
            req.usable_fuel_gal, req.fuel_flow_gph, flight_time_hrs, flight_rules
        )

    decision, reasons = make_go_no_go(
        flight_rules, approach_type, worst_ceil, worst_vis,
        wind_speed, crosswind,
        fuel_status=fuel_status_dict,
        has_alternate=bool(alt),
        arr_ceiling=ceil_arr,
        arr_vis=vis_arr,
    )

    if ceil_arr < ceil_dep:
        reasons.insert(0, f"Arrival ({arr}) has lower ceiling than departure")
    if vis_arr < vis_dep:
        reasons.insert(0, f"Arrival ({arr}) has lower visibility than departure")

    # density altitude
    today = datetime.now(timezone.utc).date()
    da_dep = da_arr = None
    if metar_dep and metar_dep.temperature_c is not None and metar_dep.altimeter_inhg and coords_dep and coords_dep[2] is not None:
        da_dep = calc_density_altitude(metar_dep.temperature_c, metar_dep.altimeter_inhg, coords_dep[2])
    if metar_arr and metar_arr.temperature_c is not None and metar_arr.altimeter_inhg and coords_arr and coords_arr[2] is not None:
        da_arr = calc_density_altitude(metar_arr.temperature_c, metar_arr.altimeter_inhg, coords_arr[2])

    # sunrise / sunset
    sr_dep = ss_dep = sr_arr = ss_arr = None
    if coords_dep:
        sr_dep, ss_dep = sun_times_utc(coords_dep[0], coords_dep[1], today)
    if coords_arr:
        sr_arr, ss_arr = sun_times_utc(coords_arr[0], coords_arr[1], today)

    flight_stats = {
        "distance_nm": round(distance_nm, 1),
        "bearing_deg": round(bearing_deg, 1),
        "flight_time_hrs": round(flight_time_hrs, 2),
        "flight_time_display": flight_time_display,
        "fuel_burn_gal": round(fuel_burn_gal, 1),
        "using_cpp": nav_bridge.using_cpp(),
        "density_alt_dep": da_dep,
        "density_alt_arr": da_arr,
        "sunrise_dep": sr_dep,
        "sunset_dep": ss_dep,
        "sunrise_arr": sr_arr,
        "sunset_arr": ss_arr,
        "fuel_status": fuel_status_dict,
        "winds_aloft_dep": winds_data.get("dep", []),
        "winds_aloft_arr": winds_data.get("arr", []),
    }

    brief_id = str(uuid.uuid4())
    created_at = datetime.now(timezone.utc).isoformat()

    brief_data = {
        "id": brief_id,
        "created_at": created_at,
        "departure": dep,
        "arrival": arr,
        "alternate": alt,
        "departure_metar": metar_dep_dict,
        "arrival_metar": metar_arr_dict,
        "alternate_metar": metar_alt_dict,
        "alternate_taf": taf_alt_dict,
        "departure_taf": taf_dep_dict,
        "arrival_taf": taf_arr_dict,
        "notams": all_notams,
        "sigmets_airmets": airsigmets_raw,
        "pireps": pireps_raw,
        "flight_stats": flight_stats,
        "decision": decision,
        "decision_reasons": reasons,
        "flight_rules": flight_rules,
        "approach_type": approach_type,
    }

    try:
        saved_id = await crud.save_briefing(db, brief_data)
        brief_data["id"] = saved_id
    except Exception as e:
        print(f"[db] save failed: {e}")

    return brief_data


@app.get("/briefings")
async def list_briefings(
    departure: Optional[str] = Query(default=None),
    arrival: Optional[str] = Query(default=None),
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(get_current_user),
):
    try:
        return await crud.get_briefings(db, departure=departure, arrival=arrival)
    except Exception as e:
        print(f"[db] error listing briefings: {e}")
        return []


@app.get("/briefings/{briefing_id}")
async def get_briefing(
    briefing_id: str,
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(get_current_user),
):
    try:
        briefing = await crud.get_briefing_by_id(db, briefing_id)
        if not briefing:
            raise HTTPException(status_code=404, detail="Briefing not found")
        return briefing
    except HTTPException:
        raise
    except Exception as e:
        print(f"[db] error fetching briefing {briefing_id}: {e}")
        raise HTTPException(status_code=500, detail="Database error")
