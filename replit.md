# SurfCast - Real-Time Surf Forecast App

## Overview
A Ventusky/Windy-style surf forecast application with real-time wind, wave, and swell data. Users can view an interactive map, pin surf spots worldwide, and check detailed forecasts for any location. All data is real - sourced from Open-Meteo's free weather and marine APIs.

## Tech Stack
- **Frontend**: React 18, Vite, TailwindCSS, ShadCN UI, Leaflet (react-leaflet v4), Recharts
- **Backend**: Express.js, Node.js
- **Database**: PostgreSQL with Drizzle ORM
- **APIs**: Open-Meteo Weather API + Marine API (free, no key required)
- **Map Tiles**: CartoDB dark tiles via OpenStreetMap

## Project Structure
```
client/src/
  components/
    surf-map.tsx        - Leaflet map with spot markers
    forecast-panel.tsx  - Right panel with weather/wave data
    spot-list.tsx       - Left sidebar spot list
    add-spot-dialog.tsx - Dialog form for saving spots
    search-location.tsx - Nominatim geocoding search
    theme-provider.tsx  - Dark/light mode context
    theme-toggle.tsx    - Theme toggle button
  pages/
    home.tsx            - Main layout page
  lib/
    weather-utils.ts    - Wind/wave formatting utilities
    queryClient.ts      - TanStack Query config

server/
  index.ts    - Express server entry
  routes.ts   - API routes (/api/spots, /api/forecast/:lat/:lng)
  storage.ts  - Database CRUD interface
  db.ts       - Drizzle/pg pool setup
  seed.ts     - Seeds default surf spots

shared/
  schema.ts   - Drizzle schema + TypeScript types
```

## Key APIs
- `GET /api/spots` - List all saved surf spots
- `POST /api/spots` - Create a new spot
- `DELETE /api/spots/:id` - Delete a spot
- `GET /api/forecast/:lat/:lng` - Fetch combined weather + marine forecast

## External APIs
- Weather: `https://api.open-meteo.com/v1/forecast`
- Marine: `https://marine-api.open-meteo.com/v1/marine`
- Geocoding: `https://nominatim.openstreetmap.org/search`

## User Preferences
- Dark mode by default (ocean/surf theme)
- Inter font family
