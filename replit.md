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
    webcam-layer.tsx    - Beach webcam markers from Windy API
    forecast-panel.tsx  - Floating overlay with weather/wave data
    spot-list.tsx       - Left sidebar spot list
    add-spot-dialog.tsx - Dialog form for saving spots
    search-location.tsx - Nominatim geocoding search
    theme-provider.tsx  - Dark/light mode context
    theme-toggle.tsx    - Theme toggle button
    user-menu.tsx       - Avatar dropdown: Profile, Sessions, Settings, Logout
  pages/
    home.tsx            - Main layout page (map + overlays)
    login.tsx           - Login page
    profile.tsx         - User profile page
    sessions.tsx        - Dawn Patrol-style surf sessions page with GPS track map
    settings.tsx        - Device connections (Apple Watch, Garmin, Strava, etc.)
  lib/
    auth.tsx            - Auth context provider + useAuth hook
    weather-utils.ts    - Wind/wave formatting utilities
    queryClient.ts      - TanStack Query config

server/
  index.ts    - Express server entry
  auth.ts     - Passport + express-session auth setup
  routes.ts   - API routes (/api/spots, /api/forecast/:lat/:lng, /api/sessions)
  storage.ts  - Database CRUD interface
  db.ts       - Drizzle/pg pool setup + pool export
  seed.ts     - Seeds default surf spots + example session + test user

shared/
  schema.ts   - Drizzle schema + TypeScript types (users, surfSpots, surfSessions, conversations, messages)
```

## Authentication
- Passport.js with local strategy + express-session + connect-pg-simple session store
- Test account: username `1234@surfcast`, password `onlywater`
- Auth routes: POST /api/auth/login, POST /api/auth/logout, GET /api/auth/me
- Frontend: AuthProvider wraps app, shows login page when unauthenticated
- Avatar dropdown menu on home page provides navigation to Profile, Sessions, Settings, and Logout

## Key APIs
- `POST /api/auth/login` - Login with username/password
- `POST /api/auth/logout` - Logout
- `GET /api/auth/me` - Get current user (401 if not logged in)
- `GET /api/spots` - List all saved surf spots
- `POST /api/spots` - Create a new spot
- `DELETE /api/spots/:id` - Delete a spot
- `GET /api/forecast/:lat/:lng` - Fetch combined weather + marine forecast
- `GET /api/webcams?south=&north=&west=&east=` - Fetch beach webcams in map bounds (Windy API)
- `GET /api/sessions` - List all surf sessions (ordered by date desc)
- `POST /api/sessions` - Create a new session (with GPS track data)
- `GET /api/sessions/:id` - Get a specific session
- `DELETE /api/sessions/:id` - Delete a session

## External APIs
- Weather: `https://api.open-meteo.com/v1/forecast`
- Marine: `https://marine-api.open-meteo.com/v1/marine`
- Geocoding: `https://nominatim.openstreetmap.org/search`
- Webcams: `https://api.windy.com/webcams/api/v3/webcams` (beach category, requires WINDY_WEBCAMS_API_KEY)

## User Preferences
- Dark mode by default (ocean/surf theme)
- Inter font family
