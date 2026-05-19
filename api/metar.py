"""
metar.py - parses raw METAR strings token by token

I referenced the FAA METAR format guide and a few aviation weather sites to
figure out all the edge cases. Some of the regex patterns are a bit gnarly
but I couldn't find a cleaner way.

Format reference: https://www.weather.gov/media/wrh/mesowest/metar_decode_key.pdf
"""

import re
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class CloudLayer:
    coverage: str       # FEW, SCT, BKN, OVC, SKC, CLR, CAVOK
    altitude_ft: Optional[int] = None   # hundreds of feet AGL, None for SKC/CLR


@dataclass
class MetarData:
    raw: str
    station_id: str = ""
    obs_time: str = ""          # e.g. "041755Z"
    wind_dir: Optional[int] = None      # degrees, None if variable
    wind_speed: int = 0         # knots
    wind_gust: Optional[int] = None
    wind_variable: bool = False
    visibility_sm: Optional[float] = None
    clouds: list = field(default_factory=list)
    temperature_c: Optional[int] = None
    dewpoint_c: Optional[int] = None
    altimeter_inhg: Optional[float] = None
    weather_phenomena: list = field(default_factory=list)
    flight_rules: str = "VFR"   # VFR, MVFR, IFR, LIFR
    remarks: str = ""
    ceiling_ft: Optional[int] = None


# weather phenomenon codes
# grabbed these from the FAA AIM
WX_CODES = {
    "RA": "Rain", "SN": "Snow", "DZ": "Drizzle", "GR": "Hail",
    "GS": "Small hail", "TS": "Thunderstorm", "FG": "Fog",
    "BR": "Mist", "HZ": "Haze", "DU": "Dust", "SA": "Sand",
    "FU": "Smoke", "VA": "Volcanic ash", "SQ": "Squall",
    "PO": "Dust whirls", "FC": "Funnel cloud", "SS": "Sandstorm",
    "DS": "Duststorm", "UP": "Unknown precip", "IC": "Ice crystals",
    "PL": "Ice pellets", "SG": "Snow grains",
}

WX_DESCRIPTORS = {
    "MI": "Shallow", "BC": "Patches", "PR": "Partial",
    "DR": "Low drifting", "BL": "Blowing", "SH": "Showers",
    "TS": "Thunderstorm", "FZ": "Freezing",
}

WX_INTENSITY = {
    "-": "Light", "+": "Heavy", "VC": "In vicinity",
}


def _parse_wind(token: str) -> tuple:
    """returns (direction, speed, gust, variable) or None if not wind token"""
    # handles: 27015KT, 27015G25KT, VRB05KT, 00000KT
    m = re.match(r'^(VRB|\d{3})(\d{2,3})(?:G(\d{2,3}))?(KT|MPS|KMH)$', token)
    if not m:
        return None

    dir_str, speed_str, gust_str, unit = m.groups()

    direction = None
    variable = False
    if dir_str == "VRB":
        variable = True
    else:
        direction = int(dir_str)

    speed = int(speed_str)
    gust = int(gust_str) if gust_str else None

    # convert to knots if needed
    if unit == "MPS":
        speed = int(speed * 1.94384)
        gust = int(gust * 1.94384) if gust else None
    elif unit == "KMH":
        speed = int(speed * 0.539957)
        gust = int(gust * 0.539957) if gust else None

    return direction, speed, gust, variable


def _parse_visibility(token: str) -> Optional[float]:
    """parses visibility token, returns value in SM"""
    # handles: 10SM, 3SM, 1/2SM, 1 1/2SM (but fractions come as prev+this tokens)
    if token.endswith("SM"):
        vis_str = token[:-2]
        if "/" in vis_str:
            num, den = vis_str.split("/")
            return float(num) / float(den)
        try:
            return float(vis_str)
        except ValueError:
            return None
    # metric - convert to SM
    if re.match(r'^\d{4}$', token):
        meters = int(token)
        if meters == 9999:
            return 10.0   # 10SM+ essentially
        return meters / 1609.34
    return None


def _parse_cloud(token: str) -> Optional[CloudLayer]:
    """parses cloud layer token like BKN025, OVC008, SCT///"""
    m = re.match(r'^(FEW|SCT|BKN|OVC|SKC|CLR|CAVOK|NSC|NCD)(\d{3})?(?:CB|TCU)?$', token)
    if not m:
        return None

    coverage, alt_str = m.groups()
    altitude = int(alt_str) * 100 if alt_str else None
    return CloudLayer(coverage=coverage, altitude_ft=altitude)


def _parse_temp_dewpoint(token: str) -> Optional[tuple]:
    """parses T/T token like 12/08, M05/M08, 21/"""
    m = re.match(r'^(M?\d{1,2})/(M?\d{1,2})?$', token)
    if not m:
        return None

    def conv(s):
        if s is None:
            return None
        if s.startswith("M"):
            return -int(s[1:])
        return int(s)

    t, d = m.groups()
    return conv(t), conv(d)


def _parse_altimeter(token: str) -> Optional[float]:
    """parses altimeter setting - A2992 (inHg) or Q1013 (hPa)"""
    if token.startswith("A") and len(token) == 5:
        try:
            return int(token[1:]) / 100.0
        except ValueError:
            return None
    if token.startswith("Q") and len(token) == 5:
        try:
            hpa = int(token[1:])
            return round(hpa * 0.02953, 2)  # convert hPa to inHg
        except ValueError:
            return None
    return None


def _parse_weather(token: str) -> Optional[str]:
    """parses weather phenomena token like -RA, +TSRA, FG, BLSN"""
    intensity_prefix = ""
    rest = token

    if token.startswith("VC"):
        intensity_prefix = "In vicinity "
        rest = token[2:]
    elif token.startswith("-"):
        intensity_prefix = "Light "
        rest = token[1:]
    elif token.startswith("+"):
        intensity_prefix = "Heavy "
        rest = token[1:]

    # check for descriptor
    descriptor = ""
    for code in WX_DESCRIPTORS:
        if rest.startswith(code) and code != "TS":  # TS is also a phenomenon
            descriptor = WX_DESCRIPTORS[code] + " "
            rest = rest[len(code):]
            break

    # find phenomenon codes - can be multiple
    phenomena = []
    while rest:
        matched = False
        for code in WX_CODES:
            if rest.startswith(code):
                phenomena.append(WX_CODES[code])
                rest = rest[len(code):]
                matched = True
                break
        if not matched:
            break

    if phenomena:
        return intensity_prefix + descriptor + "/".join(phenomena)
    return None


def _determine_flight_rules(metar: MetarData) -> str:
    """
    VFR:  ceiling >3000ft AND vis >5SM
    MVFR: ceiling 1000-3000ft OR vis 3-5SM
    IFR:  ceiling 500-1000ft OR vis 1-3SM
    LIFR: ceiling <500ft OR vis <1SM
    """
    ceiling = metar.ceiling_ft
    vis = metar.visibility_sm

    # find ceiling (lowest BKN or OVC layer)
    for layer in metar.clouds:
        if layer.coverage in ("BKN", "OVC") and layer.altitude_ft is not None:
            if ceiling is None or layer.altitude_ft < ceiling:
                ceiling = layer.altitude_ft

    # check LIFR conditions first
    lifr_ceil = ceiling is not None and ceiling < 500
    lifr_vis = vis is not None and vis < 1.0
    if lifr_ceil or lifr_vis:
        return "LIFR"

    ifr_ceil = ceiling is not None and ceiling < 1000
    ifr_vis = vis is not None and vis < 3.0
    if ifr_ceil or ifr_vis:
        return "IFR"

    mvfr_ceil = ceiling is not None and ceiling < 3000
    mvfr_vis = vis is not None and vis < 5.0
    if mvfr_ceil or mvfr_vis:
        return "MVFR"

    return "VFR"


def parse_metar(raw: str) -> MetarData:
    """
    main entry point - parses a raw METAR string
    returns MetarData with all decoded fields
    """
    metar = MetarData(raw=raw.strip())
    tokens = raw.strip().split()

    i = 0
    in_remarks = False

    # skip "METAR" or "SPECI" type prefix if present
    if tokens and tokens[0] in ("METAR", "SPECI"):
        i += 1

    # station ID - 4 letter ICAO code
    if i < len(tokens) and re.match(r'^[A-Z]{4}$', tokens[i]):
        metar.station_id = tokens[i]
        i += 1

    # observation time - DDHHMMz
    if i < len(tokens) and re.match(r'^\d{6}Z$', tokens[i]):
        metar.obs_time = tokens[i]
        i += 1

    # AUTO or COR modifier
    if i < len(tokens) and tokens[i] in ("AUTO", "COR"):
        i += 1

    # wind
    if i < len(tokens):
        wind = _parse_wind(tokens[i])
        if wind:
            metar.wind_dir, metar.wind_speed, metar.wind_gust, metar.wind_variable = wind
            i += 1

        # variable wind direction range like 280V350
        if i < len(tokens) and re.match(r'^\d{3}V\d{3}$', tokens[i]):
            i += 1  # skip it for now, could parse the range later

    # visibility - might be fractional (two tokens like "1 1/2SM")
    if i < len(tokens):
        vis = _parse_visibility(tokens[i])
        if vis is not None:
            metar.visibility_sm = vis
            i += 1
        # check for fractional visibility like "1 1/2SM"
        elif re.match(r'^\d+$', tokens[i]) and i+1 < len(tokens) and tokens[i+1].endswith("SM"):
            whole = int(tokens[i])
            frac_vis = _parse_visibility(tokens[i+1])
            if frac_vis:
                metar.visibility_sm = whole + frac_vis
                i += 2

    # CAVOK
    if i < len(tokens) and tokens[i] == "CAVOK":
        metar.visibility_sm = 10.0
        i += 1

    # runway visual range - skip these, not super useful for our purposes
    while i < len(tokens) and re.match(r'^R\d{2}[LCR]?/', tokens[i]):
        i += 1

    # weather phenomena
    while i < len(tokens):
        wx = _parse_weather(tokens[i])
        if wx:
            metar.weather_phenomena.append(wx)
            i += 1
        else:
            break

    # cloud layers
    while i < len(tokens):
        cloud = _parse_cloud(tokens[i])
        if cloud:
            metar.clouds.append(cloud)
            i += 1
        else:
            break

    # vertical visibility VV/// or VV004
    if i < len(tokens) and re.match(r'^VV(\d{3}|///)$', tokens[i]):
        m = re.match(r'^VV(\d{3})$', tokens[i])
        if m:
            metar.ceiling_ft = int(m.group(1)) * 100
        i += 1

    # temperature/dewpoint
    if i < len(tokens):
        td = _parse_temp_dewpoint(tokens[i])
        if td:
            metar.temperature_c, metar.dewpoint_c = td
            i += 1

    # altimeter
    if i < len(tokens):
        alt = _parse_altimeter(tokens[i])
        if alt:
            metar.altimeter_inhg = alt
            i += 1

    # remarks section
    while i < len(tokens):
        if tokens[i] == "RMK":
            in_remarks = True
            i += 1
            continue
        if in_remarks:
            metar.remarks = " ".join(tokens[i:])
            break
        i += 1

    # calculate ceiling (lowest BKN or OVC)
    for layer in metar.clouds:
        if layer.coverage in ("BKN", "OVC") and layer.altitude_ft is not None:
            if metar.ceiling_ft is None or layer.altitude_ft < metar.ceiling_ft:
                metar.ceiling_ft = layer.altitude_ft

    # SKC/CLR/CAVOK means no ceiling
    for layer in metar.clouds:
        if layer.coverage in ("SKC", "CLR", "CAVOK", "NSC"):
            metar.ceiling_ft = 99999  # effectively unlimited

    # determine flight rules
    metar.flight_rules = _determine_flight_rules(metar)

    return metar


def metar_to_dict(m: MetarData) -> dict:
    """serialize MetarData to a plain dict for JSON responses"""
    return {
        "raw": m.raw,
        "station_id": m.station_id,
        "obs_time": m.obs_time,
        "wind_dir": m.wind_dir,
        "wind_speed": m.wind_speed,
        "wind_gust": m.wind_gust,
        "wind_variable": m.wind_variable,
        "visibility_sm": m.visibility_sm,
        "clouds": [{"coverage": c.coverage, "altitude_ft": c.altitude_ft} for c in m.clouds],
        "temperature_c": m.temperature_c,
        "dewpoint_c": m.dewpoint_c,
        "altimeter_inhg": m.altimeter_inhg,
        "weather_phenomena": m.weather_phenomena,
        "flight_rules": m.flight_rules,
        "ceiling_ft": m.ceiling_ft if m.ceiling_ft != 99999 else None,
        "remarks": m.remarks,
    }
