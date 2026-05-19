from pydantic import BaseModel, Field
from typing import Optional, List, Any


class UserCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=32)
    password: str = Field(..., min_length=8)


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class BriefRequest(BaseModel):
    departure: str = Field(..., min_length=3, max_length=4)
    arrival: str = Field(..., min_length=3, max_length=4)
    alternate: Optional[str] = Field(default=None, min_length=3, max_length=4)
    cruise_speed_kts: Optional[float] = Field(default=120.0, gt=0)
    fuel_flow_gph: Optional[float] = Field(default=8.5, gt=0)
    usable_fuel_gal: Optional[float] = Field(default=None, gt=0)
    cruise_alt_ft: Optional[int] = Field(default=5000, gt=0)
    approach_type: Optional[str] = Field(default='visual')

    def model_post_init(self, __context):
        self.departure = self.departure.upper()
        self.arrival = self.arrival.upper()
        if self.alternate:
            self.alternate = self.alternate.upper()


class CloudLayerSchema(BaseModel):
    coverage: str
    altitude_ft: Optional[int]


class MetarSchema(BaseModel):
    raw: str
    station_id: str
    obs_time: str
    wind_dir: Optional[int]
    wind_speed: int
    wind_gust: Optional[int]
    wind_variable: bool
    visibility_sm: Optional[float]
    clouds: List[CloudLayerSchema]
    temperature_c: Optional[int]
    dewpoint_c: Optional[int]
    altimeter_inhg: Optional[float]
    weather_phenomena: List[str]
    flight_rules: str
    ceiling_ft: Optional[int]
    remarks: str


class TafPeriodSchema(BaseModel):
    change_type: str
    valid_from: str
    valid_to: str
    valid_from_display: str
    valid_to_display: str
    wind_dir: Optional[int]
    wind_speed: int
    wind_gust: Optional[int]
    wind_variable: bool
    visibility_sm: Optional[float]
    clouds: List[CloudLayerSchema]
    weather_phenomena: List[str]
    flight_rules: str
    ceiling_ft: Optional[int]
    probability: Optional[int]


class TafSchema(BaseModel):
    raw: str
    station_id: str
    issue_time: str
    valid_from: str
    valid_to: str
    periods: List[TafPeriodSchema]


class NotamSchema(BaseModel):
    id: str
    location: str
    text: str
    category: str   # runway | taxiway | navaid | airspace | obstacle | procedure | lighting | other
    raw: Any = None


class WindsAloftLevel(BaseModel):
    altitude_ft: int
    wind_dir: Optional[int]
    wind_speed: int
    temperature_c: Optional[int]


class SigmetAirmet(BaseModel):
    type: str        # SIGMET | AIRMET
    hazard: str      # TS | ICE | TURB | IFR | MTN_OBSCN | ...
    raw: str
    valid_from: Optional[str] = None
    valid_to: Optional[str] = None


class Pirep(BaseModel):
    raw: str
    location: Optional[str] = None
    altitude_ft: Optional[int] = None
    turbulence: Optional[str] = None
    icing: Optional[str] = None
    temperature_c: Optional[int] = None
    sky_condition: Optional[str] = None


class FuelStatus(BaseModel):
    usable_gal: float
    burn_gal: float
    reserve_gal: float
    reserve_min: float
    required_reserve_min: float
    status: str   # OK | LOW | NOGO


class FlightStatsSchema(BaseModel):
    distance_nm: float
    bearing_deg: float
    flight_time_hrs: float
    flight_time_display: str
    fuel_burn_gal: float
    using_cpp: bool
    density_alt_dep: Optional[int] = None
    density_alt_arr: Optional[int] = None
    sunrise_dep: Optional[str] = None
    sunset_dep: Optional[str] = None
    sunrise_arr: Optional[str] = None
    sunset_arr: Optional[str] = None
    fuel_status: Optional[FuelStatus] = None
    winds_aloft_dep: List[WindsAloftLevel] = []
    winds_aloft_arr: List[WindsAloftLevel] = []


class BriefResponse(BaseModel):
    id: str
    created_at: str
    departure: str
    arrival: str
    alternate: Optional[str] = None
    departure_metar: Optional[MetarSchema]
    arrival_metar: Optional[MetarSchema]
    alternate_metar: Optional[MetarSchema] = None
    alternate_taf: Optional[TafSchema] = None
    departure_taf: Optional[TafSchema]
    arrival_taf: Optional[TafSchema]
    notams: List[NotamSchema]
    sigmets_airmets: List[SigmetAirmet] = []
    pireps: List[Pirep] = []
    flight_stats: FlightStatsSchema
    decision: str
    decision_reasons: List[str]
    flight_rules: str
    approach_type: str


class BriefingSummary(BaseModel):
    id: str
    created_at: str
    departure: str
    arrival: str
    distance_nm: float
    flight_time_hrs: float
    decision: str
    departure_flight_rules: str
    arrival_flight_rules: str
