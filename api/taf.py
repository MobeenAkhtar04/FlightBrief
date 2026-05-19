"""
taf.py - parse raw TAF (Terminal Aerodrome Forecast) strings

TAF format is similar to METAR but adds forecast periods with change groups.
this took a while to figure out - the FAA format has a bunch of edge cases

reference: https://aviationweather.gov/data/example/taf.php
"""

import re
from dataclasses import dataclass, field
from typing import Optional

from metar import CloudLayer, _parse_wind, _parse_visibility, _parse_cloud, _parse_weather, _determine_flight_rules, MetarData


@dataclass
class TafPeriod:
    change_type: str        # FM, TEMPO, BECMG, PROB, or BASE (the base forecast)
    valid_from: str         # "DDHHMM" format
    valid_to: str           # "DDHHMM" format
    wind_dir: Optional[int] = None
    wind_speed: int = 0
    wind_gust: Optional[int] = None
    wind_variable: bool = False
    visibility_sm: Optional[float] = None
    clouds: list = field(default_factory=list)
    weather_phenomena: list = field(default_factory=list)
    flight_rules: str = "VFR"
    probability: Optional[int] = None  # for PROB30/PROB40 groups
    ceiling_ft: Optional[int] = None


@dataclass
class TafData:
    raw: str
    station_id: str = ""
    issue_time: str = ""
    valid_from: str = ""
    valid_to: str = ""
    periods: list = field(default_factory=list)


def _period_flight_rules(period: TafPeriod) -> str:
    """reuse the logic from metar but adapted for TafPeriod"""
    # create a fake MetarData to use the existing function
    fake = MetarData(raw="")
    fake.ceiling_ft = period.ceiling_ft
    fake.visibility_sm = period.visibility_sm
    fake.clouds = period.clouds
    result = _determine_flight_rules(fake)
    period.ceiling_ft = fake.ceiling_ft  # might have been updated
    return result


def _parse_period_tokens(tokens: list, period: TafPeriod):
    """parse the weather tokens within a forecast period"""
    i = 0
    while i < len(tokens):
        tok = tokens[i]

        # wind
        wind = _parse_wind(tok)
        if wind:
            period.wind_dir, period.wind_speed, period.wind_gust, period.wind_variable = wind
            i += 1
            # variable direction range
            if i < len(tokens) and re.match(r'^\d{3}V\d{3}$', tokens[i]):
                i += 1
            continue

        # visibility
        vis = _parse_visibility(tok)
        if vis is not None:
            period.visibility_sm = vis
            i += 1
            continue

        # fractional visibility
        if re.match(r'^\d+$', tok) and i+1 < len(tokens) and tokens[i+1].endswith("SM"):
            frac_vis = _parse_visibility(tokens[i+1])
            if frac_vis:
                period.visibility_sm = int(tok) + frac_vis
                i += 2
                continue

        if tok == "CAVOK":
            period.visibility_sm = 10.0
            i += 1
            continue

        # NSW (no significant weather - clears previous wx)
        if tok == "NSW":
            period.weather_phenomena = []
            i += 1
            continue

        # skip runway visual range in TAF (rare but exists)
        if re.match(r'^R\d{2}[LCR]?/', tok):
            i += 1
            continue

        # weather phenomena
        wx = _parse_weather(tok)
        if wx:
            period.weather_phenomena.append(wx)
            i += 1
            continue

        # cloud layer
        cloud = _parse_cloud(tok)
        if cloud:
            period.clouds.append(cloud)
            i += 1
            continue

        # vertical visibility
        if re.match(r'^VV(\d{3}|///)$', tok):
            m = re.match(r'^VV(\d{3})$', tok)
            if m:
                period.ceiling_ft = int(m.group(1)) * 100
            i += 1
            continue

        # SKC/CLR explicit
        if tok in ("SKC", "CLR", "NSC"):
            period.clouds = [CloudLayer(coverage=tok)]
            i += 1
            continue

        # wind shear - WS020/18045KT - skip for now
        if tok.startswith("WS"):
            i += 1
            continue

        i += 1

    # calculate ceiling for this period
    for layer in period.clouds:
        if layer.coverage in ("BKN", "OVC") and layer.altitude_ft is not None:
            if period.ceiling_ft is None or layer.altitude_ft < period.ceiling_ft:
                period.ceiling_ft = layer.altitude_ft

    for layer in period.clouds:
        if layer.coverage in ("SKC", "CLR", "NSC", "CAVOK"):
            period.ceiling_ft = 99999

    period.flight_rules = _period_flight_rules(period)


def _format_taf_time(ddhhmm: str) -> str:
    """convert DDHHMM to a human readable string"""
    if len(ddhhmm) >= 6:
        day = ddhhmm[0:2]
        hour = ddhhmm[2:4]
        minute = ddhhmm[4:6]
        return f"Day {day} {hour}:{minute}Z"
    return ddhhmm


def parse_taf(raw: str) -> TafData:
    """
    parse a raw TAF string into structured forecast periods
    handles: FM, BECMG, TEMPO, PROB30, PROB40
    """
    taf = TafData(raw=raw.strip())

    # clean up the string - TAFs sometimes have line breaks
    cleaned = re.sub(r'\s+', ' ', raw.strip())
    tokens = cleaned.split()

    i = 0

    # skip TAF prefix
    if tokens and tokens[i] in ("TAF", "TAF AMD", "TAF COR"):
        i += 1
    if i < len(tokens) and tokens[i] in ("AMD", "COR"):
        i += 1

    # station ID
    if i < len(tokens) and re.match(r'^[A-Z]{4}$', tokens[i]):
        taf.station_id = tokens[i]
        i += 1

    # issue time
    if i < len(tokens) and re.match(r'^\d{6}Z$', tokens[i]):
        taf.issue_time = tokens[i]
        i += 1

    # valid period like 0418/0518 or 041800Z
    if i < len(tokens):
        # new format: DDHH/DDHH
        m = re.match(r'^(\d{4})/(\d{4})$', tokens[i])
        if m:
            taf.valid_from = m.group(1) + "00"  # pad to DDHHMM
            taf.valid_to = m.group(2) + "00"
            i += 1
        # old format: DDHHMMz DDHHMMz
        elif re.match(r'^\d{6}Z$', tokens[i]):
            taf.valid_from = tokens[i][:-1]
            i += 1
            if i < len(tokens) and re.match(r'^\d{6}Z$', tokens[i]):
                taf.valid_to = tokens[i][:-1]
                i += 1

    # split remaining tokens into change groups
    # markers that start new periods: FM, TEMPO, BECMG, PROB
    CHANGE_MARKERS = {"FM", "TEMPO", "BECMG", "PROB30", "PROB40"}

    # collect all period boundaries
    period_starts = []  # list of (index, change_type, valid_from, valid_to)

    # base forecast period starts now
    period_starts.append((i, "BASE", taf.valid_from, taf.valid_to, None))

    j = i
    while j < len(tokens):
        tok = tokens[j]

        if tok.startswith("FM") and len(tok) >= 8 and tok[2:].isdigit():
            # FM + DDHHMM inline like FM041800
            fm_time = tok[2:]
            period_starts.append((j+1, "FM", fm_time, taf.valid_to, None))
            j += 1

        elif tok in ("TEMPO", "BECMG"):
            # next token should be DDHH/DDHH time range
            if j+1 < len(tokens):
                m = re.match(r'^(\d{4})/(\d{4})$', tokens[j+1])
                if m:
                    vfrom = m.group(1) + "00"
                    vto = m.group(2) + "00"
                    period_starts.append((j+2, tok, vfrom, vto, None))
                    j += 2
                    continue
            period_starts.append((j+1, tok, "", "", None))
            j += 1

        elif tok in ("PROB30", "PROB40"):
            prob = int(tok[4:])
            # PROB might be followed by TEMPO
            if j+1 < len(tokens) and tokens[j+1] == "TEMPO":
                change_type = "PROB_TEMPO"
                j += 2
            else:
                change_type = "PROB"
                j += 1

            if j < len(tokens):
                m = re.match(r'^(\d{4})/(\d{4})$', tokens[j])
                if m:
                    vfrom = m.group(1) + "00"
                    vto = m.group(2) + "00"
                    period_starts.append((j+1, change_type, vfrom, vto, prob))
                    j += 1
                    continue
            period_starts.append((j, change_type, "", "", prob))

        else:
            j += 1

    # now parse each period
    for idx, (start_idx, change_type, vfrom, vto, prob) in enumerate(period_starts):
        # figure out where this period's tokens end
        if idx + 1 < len(period_starts):
            end_idx = period_starts[idx + 1][0]
            # back up to before the marker keyword
            # the marker itself is at start of next period minus the marker token
            # actually the start_idx already points AFTER the marker so we need
            # to look at the marker position which is start of next - (1 or 2 tokens)
            # this is getting complicated... let me just use a range
            next_start = period_starts[idx + 1][0]
            # the FM/TEMPO/BECMG marker is 1 token before next_start (usually)
            period_tokens = tokens[start_idx:next_start - 1] if next_start > start_idx else []
        else:
            period_tokens = tokens[start_idx:]

        period = TafPeriod(
            change_type=change_type,
            valid_from=vfrom,
            valid_to=vto,
            probability=prob,
        )
        _parse_period_tokens(period_tokens, period)
        taf.periods.append(period)

    return taf


def taf_period_to_dict(p: TafPeriod) -> dict:
    return {
        "change_type": p.change_type,
        "valid_from": p.valid_from,
        "valid_to": p.valid_to,
        "valid_from_display": _format_taf_time(p.valid_from),
        "valid_to_display": _format_taf_time(p.valid_to),
        "wind_dir": p.wind_dir,
        "wind_speed": p.wind_speed,
        "wind_gust": p.wind_gust,
        "wind_variable": p.wind_variable,
        "visibility_sm": p.visibility_sm,
        "clouds": [{"coverage": c.coverage, "altitude_ft": c.altitude_ft} for c in p.clouds],
        "weather_phenomena": p.weather_phenomena,
        "flight_rules": p.flight_rules,
        "ceiling_ft": p.ceiling_ft if p.ceiling_ft != 99999 else None,
        "probability": p.probability,
    }


def taf_to_dict(t: TafData) -> dict:
    return {
        "raw": t.raw,
        "station_id": t.station_id,
        "issue_time": t.issue_time,
        "valid_from": t.valid_from,
        "valid_to": t.valid_to,
        "periods": [taf_period_to_dict(p) for p in t.periods],
    }
