"""
nav_bridge.py - wraps the C++ navengine extension

tries to import the compiled .so first, falls back to pure python
if the C++ module isn't built yet. the fallback math should give
same results but will be slower for large batches (not that we really
have large batches here lol)
"""

import math
from typing import NamedTuple

# attempt to load the compiled C++ extension
try:
    import navengine_ext as _eng
    _USING_CPP = True
    print("[nav_bridge] using C++ navengine_ext")
except ImportError:
    _USING_CPP = False
    print("[nav_bridge] C++ extension not found, using python fallback")


# ─── pure python fallback implementations ────────────────────────────────────

# WGS84 constants
_WGS84_A = 6378137.0
_WGS84_F = 1 / 298.257223563
_WGS84_B = _WGS84_A * (1 - _WGS84_F)
_NM_PER_METER = 1 / 1852.0


def _vincenty_py(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    if lat1 == lat2 and lon1 == lon2:
        return 0.0

    a, f, b = _WGS84_A, _WGS84_F, _WGS84_B
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    L = math.radians(lon2 - lon1)

    U1 = math.atan((1 - f) * math.tan(phi1))
    U2 = math.atan((1 - f) * math.tan(phi2))
    sinU1, cosU1 = math.sin(U1), math.cos(U1)
    sinU2, cosU2 = math.sin(U2), math.cos(U2)

    lam = L
    for _ in range(100):
        sinLam, cosLam = math.sin(lam), math.cos(lam)
        t1 = cosU2 * sinLam
        t2 = cosU1 * sinU2 - sinU1 * cosU2 * cosLam
        sinSigma = math.sqrt(t1**2 + t2**2)
        if sinSigma == 0:
            return 0.0
        cosSigma = sinU1 * sinU2 + cosU1 * cosU2 * cosLam
        sigma = math.atan2(sinSigma, cosSigma)
        sinAlpha = cosU1 * cosU2 * sinLam / sinSigma
        cos2Alpha = 1 - sinAlpha**2
        cos2SigmaM = cosSigma - 2*sinU1*sinU2/cos2Alpha if cos2Alpha != 0 else 0.0
        C = f/16 * cos2Alpha * (4 + f*(4 - 3*cos2Alpha))
        lam_prev = lam
        lam = L + (1-C)*f*sinAlpha*(sigma + C*sinSigma*(cos2SigmaM + C*cosSigma*(-1 + 2*cos2SigmaM**2)))
        if abs(lam - lam_prev) < 1e-12:
            break

    uSq = cos2Alpha * (a**2 - b**2) / b**2
    A_c = 1 + uSq/16384*(4096 + uSq*(-768 + uSq*(320 - 175*uSq)))
    B_c = uSq/1024*(256 + uSq*(-128 + uSq*(74 - 47*uSq)))
    dSig = B_c*sinSigma*(cos2SigmaM + B_c/4*(cosSigma*(-1 + 2*cos2SigmaM**2) -
           B_c/6*cos2SigmaM*(-3 + 4*sinSigma**2)*(-3 + 4*cos2SigmaM**2)))

    return b * A_c * (sigma - dSig) * _NM_PER_METER


def _bearing_py(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dLon = math.radians(lon2 - lon1)
    y = math.sin(dLon) * math.cos(phi2)
    x = math.cos(phi1)*math.sin(phi2) - math.sin(phi1)*math.cos(phi2)*math.cos(dLon)
    return (math.degrees(math.atan2(y, x)) + 360) % 360


class _FlightTimePy:
    def __init__(self, hours, minutes, total_hours):
        self.hours = hours
        self.minutes = minutes
        self.total_hours = total_hours


class _GoNoGoPy:
    def __init__(self, decision, reasons):
        self.decision = decision
        self.reasons = reasons


def _flight_time_py(distance_nm: float, cruise_speed_kts: float) -> _FlightTimePy:
    if cruise_speed_kts <= 0:
        return _FlightTimePy(0, 0, 0.0)
    total = distance_nm / cruise_speed_kts
    hrs = int(total)
    mins = int((total - hrs) * 60)
    return _FlightTimePy(hrs, mins, total)


def _fuel_burn_py(distance_nm: float, cruise_speed_kts: float, fuel_flow_gph: float) -> float:
    if cruise_speed_kts <= 0:
        return 0.0
    return (distance_nm / cruise_speed_kts) * fuel_flow_gph * 1.10


def _crosswind_py(wind_dir: float, wind_speed: float, runway_heading: float) -> float:
    angle = math.radians(wind_dir - runway_heading)
    return wind_speed * math.sin(angle)


def _headwind_py(wind_dir: float, wind_speed: float, runway_heading: float) -> float:
    angle = math.radians(wind_dir - runway_heading)
    return wind_speed * math.cos(angle)


def _go_no_go_py(ceiling_ft: float, visibility_sm: float,
                  wind_speed_kts: float, crosswind_kts: float) -> _GoNoGoPy:
    decision = "GO"
    reasons = []

    if ceiling_ft < 1000:
        decision = "NOGO"
        reasons.append(f"Ceiling {int(ceiling_ft)}ft is below 1000ft minimum")
    elif ceiling_ft < 3000:
        reasons.append(f"Ceiling {int(ceiling_ft)}ft is marginal VFR")

    if visibility_sm < 3.0:
        decision = "NOGO"
        reasons.append(f"Visibility {visibility_sm}SM is below 3SM VFR minimum")
    elif visibility_sm < 5.0:
        reasons.append(f"Visibility {visibility_sm}SM is marginal")

    if crosswind_kts > 20:
        decision = "NOGO"
        reasons.append(f"Crosswind {int(crosswind_kts)}kts exceeds 20kt limit")
    elif crosswind_kts > 15:
        reasons.append(f"Crosswind {int(crosswind_kts)}kts is high")

    if wind_speed_kts > 30:
        decision = "NOGO"
        reasons.append(f"Wind speed {int(wind_speed_kts)}kts is excessive")
    elif wind_speed_kts > 20:
        reasons.append(f"Wind speed {int(wind_speed_kts)}kts is strong")

    if not reasons:
        reasons.append("All conditions within limits")

    return _GoNoGoPy(decision, reasons)


# ─── public API ──────────────────────────────────────────────────────────────

def vincenty_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    if _USING_CPP:
        return _eng.vincenty_distance(lat1, lon1, lat2, lon2)
    return _vincenty_py(lat1, lon1, lat2, lon2)


def initial_bearing(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    if _USING_CPP:
        return _eng.initial_bearing(lat1, lon1, lat2, lon2)
    return _bearing_py(lat1, lon1, lat2, lon2)


def crosswind_component(wind_dir: float, wind_speed: float, runway_heading: float) -> float:
    if _USING_CPP:
        return _eng.crosswind_component(wind_dir, wind_speed, runway_heading)
    return _crosswind_py(wind_dir, wind_speed, runway_heading)


def headwind_component(wind_dir: float, wind_speed: float, runway_heading: float) -> float:
    if _USING_CPP:
        return _eng.headwind_component(wind_dir, wind_speed, runway_heading)
    return _headwind_py(wind_dir, wind_speed, runway_heading)


def fuel_burn(distance_nm: float, cruise_speed_kts: float, fuel_flow_gph: float) -> float:
    if _USING_CPP:
        return _eng.fuel_burn(distance_nm, cruise_speed_kts, fuel_flow_gph)
    return _fuel_burn_py(distance_nm, cruise_speed_kts, fuel_flow_gph)


def flight_time(distance_nm: float, cruise_speed_kts: float):
    if _USING_CPP:
        return _eng.flight_time(distance_nm, cruise_speed_kts)
    return _flight_time_py(distance_nm, cruise_speed_kts)


def go_no_go(ceiling_ft: float, visibility_sm: float,
              wind_speed_kts: float, crosswind_kts: float):
    if _USING_CPP:
        return _eng.go_no_go(ceiling_ft, visibility_sm, wind_speed_kts, crosswind_kts)
    return _go_no_go_py(ceiling_ft, visibility_sm, wind_speed_kts, crosswind_kts)


def using_cpp() -> bool:
    return _USING_CPP
