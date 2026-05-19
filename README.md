# FlightBrief

Pre-flight weather briefing tool. Enter two ICAO airport codes, pick an aircraft, and it fetches live METARs, TAFs, and NOTAMs from the FAA Aviation Weather Center and gives you a go/no-go with ceiling charts, a runway wind diagram, and decoded weather.

**Not for actual flight planning.** Get a real briefing from 1800wxbrief.com or DUATS before you fly.

## What it does

Enter a departure and arrival ICAO, select an aircraft preset (or enter your own speed/fuel numbers), and hit GET BRIEF. The backend fires concurrent requests to aviationweather.gov for both airports — raw METAR, TAF, NOTAMs, and coordinates — then runs the nav calculations through a C++ extension compiled with pybind11. Distance and bearing use Vincenty's formulae for accuracy on longer routes. The result comes back as a single response the frontend renders all at once.

The go/no-go decision is based on ceiling, visibility, and crosswind at departure. The frontend also does a range check on top of that — if you pick a Cessna 172 and route it KJFK to OMAA it's going to tell you NOGO regardless of the weather, because the plane can't make it.

The ceiling/visibility charts show a 12-hour trend from the TAF with IFR/MVFR/VFR bands. The runway diagram draws crosswind and headwind components on a canvas — enter a runway heading in the advanced section to use your actual runway instead of worst-case.

## Stack

- **C++17** — Vincenty geodesy, wind components, fuel burn (compiled to `navengine.so`)
- **pybind11** — Python bindings for the C++ engine; falls back to a pure Python version automatically if the .so isn't found
- **FastAPI** — REST API, async throughout, `httpx` for the AWC requests
- **PostgreSQL** / asyncpg — briefing history
- **React 18 + TypeScript** — frontend
- **Chart.js** — ceiling/vis trend charts
- **Docker + docker-compose** — runs everything

## Running

```bash
docker-compose up --build
```

Frontend at http://localhost:5173, API at http://localhost:8000, Swagger at http://localhost:8000/docs.

The C++ extension builds inside the API container. If it fails for any reason the API logs `[nav_bridge] C++ extension not found, using python fallback` and keeps going.

### Without Docker

Needs Postgres already running.

```bash
# API
cd api
pip install -r ../requirements.txt
DATABASE_URL="postgresql+asyncpg://user:pass@localhost:5432/flightbrief" uvicorn main:app --reload

# frontend (separate terminal)
cd frontend
npm install
VITE_API_URL=http://localhost:8000 npm run dev
```

### Building the C++ extension manually

```bash
pip install pybind11
cd cpp
mkdir build && cd build
cmake ..
cmake --build . -- -j4
```

CMake puts the `.so` in `api/` automatically.

## API

`POST /brief` — generate a briefing  
`GET /briefings` — list history  
`GET /briefings/{id}` — single briefing  
`GET /health` — healthcheck

### POST /brief

```json
{
  "departure": "KJFK",
  "arrival": "KBOS",
  "cruise_speed_kts": 122,
  "fuel_flow_gph": 8.5
}
```

Response shape is in `api/schemas.py`.

## Environment variables

`DATABASE_URL` — Postgres connection string (default: `postgresql+asyncpg://flightbrief:flightbrief@localhost:5432/flightbrief`)  
`VITE_API_URL` — API base URL for the frontend (default: `http://localhost:8000`)

## Project structure

```
FlightBrief/
├── cpp/
│   ├── navengine.hpp / .cpp    Vincenty + wind math
│   └── bindings.cpp            pybind11 module
├── api/
│   ├── main.py                 FastAPI app, AWC fetch logic
│   ├── metar.py / taf.py       parsers
│   ├── notam.py                NOTAM fetcher
│   ├── nav_bridge.py           Python fallback nav engine
│   ├── schemas.py              Pydantic models
│   └── crud.py / database.py  DB layer
├── frontend/src/
│   ├── components/             one file per UI card
│   ├── hooks/useBriefApi.ts
│   └── types/brief.ts
├── db/schema.sql
└── docker-compose.yml
```

## Known issues / limitations

- International airports sometimes aren't in the AWC database. When that happens you get a placeholder card instead of a METAR/TAF rather than a crash.
- Range check is frontend-only and uses the preset values. It doesn't factor in winds aloft, fuel reserves, or alternates.
- If you don't enter a runway heading the crosswind calculation uses 90° (worst case).
- PROB30/PROB40 groups in TAFs get treated the same as TEMPO — no probability weighting.
- NOTAM sorting is by time proximity to your ETA, not actual operational relevance.
