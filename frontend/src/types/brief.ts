export interface CloudLayer {
  coverage: string
  altitude_ft: number | null
}

export interface MetarData {
  raw: string
  station_id: string
  obs_time: string
  wind_dir: number | null
  wind_speed: number
  wind_gust: number | null
  wind_variable: boolean
  visibility_sm: number | null
  clouds: CloudLayer[]
  temperature_c: number | null
  dewpoint_c: number | null
  altimeter_inhg: number | null
  weather_phenomena: string[]
  flight_rules: 'VFR' | 'MVFR' | 'IFR' | 'LIFR'
  ceiling_ft: number | null
  remarks: string
}

export interface TafPeriod {
  change_type: string
  valid_from: string
  valid_to: string
  valid_from_display: string
  valid_to_display: string
  wind_dir: number | null
  wind_speed: number
  wind_gust: number | null
  wind_variable: boolean
  visibility_sm: number | null
  clouds: CloudLayer[]
  weather_phenomena: string[]
  flight_rules: 'VFR' | 'MVFR' | 'IFR' | 'LIFR'
  ceiling_ft: number | null
  probability: number | null
}

export interface TafData {
  raw: string
  station_id: string
  issue_time: string
  valid_from: string
  valid_to: string
  periods: TafPeriod[]
}

export interface Notam {
  id: string
  location: string
  text: string
  category: string   // runway | taxiway | navaid | airspace | obstacle | procedure | lighting | other
  raw?: any
}

export interface WindsAloftLevel {
  altitude_ft: number
  wind_dir: number | null
  wind_speed: number
  temperature_c: number | null
}

export interface SigmetAirmet {
  type: string    // SIGMET | AIRMET
  hazard: string
  raw: string
  valid_from: string | null
  valid_to: string | null
}

export interface Pirep {
  raw: string
  location: string | null
  altitude_ft: number | null
  turbulence: string | null
  icing: string | null
  temperature_c: number | null
  sky_condition: string | null
}

export interface FuelStatus {
  usable_gal: number
  burn_gal: number
  reserve_gal: number
  reserve_min: number
  required_reserve_min: number
  status: 'OK' | 'LOW' | 'NOGO'
}

export interface FlightStats {
  distance_nm: number
  bearing_deg: number
  flight_time_hrs: number
  flight_time_display: string
  fuel_burn_gal: number
  using_cpp: boolean
  density_alt_dep: number | null
  density_alt_arr: number | null
  sunrise_dep: string | null
  sunset_dep: string | null
  sunrise_arr: string | null
  sunset_arr: string | null
  fuel_status: FuelStatus | null
  winds_aloft_dep: WindsAloftLevel[]
  winds_aloft_arr: WindsAloftLevel[]
}

export interface BriefResponse {
  id: string
  created_at: string
  departure: string
  arrival: string
  alternate: string | null
  departure_metar: MetarData | null
  arrival_metar: MetarData | null
  alternate_metar: MetarData | null
  alternate_taf: TafData | null
  departure_taf: TafData | null
  arrival_taf: TafData | null
  notams: Notam[]
  sigmets_airmets: SigmetAirmet[]
  pireps: Pirep[]
  flight_stats: FlightStats
  decision: 'GO' | 'CAUTION' | 'NOGO'
  decision_reasons: string[]
  flight_rules: string
  approach_type: string
}

export interface BriefingSummary {
  id: string
  created_at: string
  departure: string
  arrival: string
  distance_nm: number
  flight_time_hrs: number
  decision: 'GO' | 'CAUTION' | 'NOGO'
  departure_flight_rules: string
  arrival_flight_rules: string
}
