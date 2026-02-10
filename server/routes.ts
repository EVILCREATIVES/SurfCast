import type { Express } from "express";
import { storage } from "./storage";
import { insertSurfSpotSchema, insertSurfSessionSchema } from "../shared/schema";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API,
});

const gridWeatherCache = new Map<string, { data: any; timestamp: number }>();
const GRID_CACHE_TTL = 10 * 60 * 1000;
let lastGoodGridData: { data: any; timestamp: number } | null = null;
let gridRateLimitUntil = 0;

function generateSyntheticWindData(s: number, n: number, w: number, e: number) {
  const points: any[] = [];
  const latStep = (n - s) / 5;
  const lngStep = (e - w) / 7;
  const t = Date.now() / 3600000;

  for (let lat = s + latStep / 2; lat <= n; lat += latStep) {
    for (let lng = w + lngStep / 2; lng <= e; lng += lngStep) {
      const latRad = (lat * Math.PI) / 180;
      const tradeWindBase = 15 + 10 * Math.cos(latRad * 2);
      const dirBase = lat > 0 ? 225 + lat * 0.5 : 315 - lat * 0.5;
      const variation = Math.sin(lng * 0.05 + t) * 8 + Math.cos(lat * 0.08 + t * 0.7) * 5;
      const dirVariation = Math.sin(lat * 0.1 + lng * 0.05 + t * 0.3) * 30;

      const windSpeed = Math.max(2, Math.min(45, tradeWindBase + variation));
      const windDir = ((dirBase + dirVariation) % 360 + 360) % 360;

      const isCoastal = Math.abs(lat) < 60;
      const waveHeight = isCoastal ? Math.max(0.2, windSpeed * 0.08 + Math.sin(lat * 0.15 + t) * 0.5) : null;
      const waveDir = isCoastal ? ((windDir + 10 + Math.sin(lng * 0.1) * 15) % 360) : null;
      const wavePeriod = isCoastal ? Math.max(4, 6 + windSpeed * 0.15 + Math.sin(lat * 0.2) * 2) : null;

      points.push({
        lat: Math.round(lat * 10) / 10,
        lng: Math.round(lng * 10) / 10,
        windSpeed: Math.round(windSpeed * 10) / 10,
        windDir: Math.round(windDir),
        temp: Math.round((25 - Math.abs(lat) * 0.4 + Math.sin(lng * 0.05) * 3) * 10) / 10,
        waveHeight: waveHeight ? Math.round(waveHeight * 10) / 10 : null,
        waveDir: waveDir ? Math.round(waveDir) : null,
        wavePeriod: wavePeriod ? Math.round(wavePeriod * 10) / 10 : null,
      });
    }
  }
  return { points };
}

const forecastCache = new Map<string, { data: any; timestamp: number }>();
const FORECAST_CACHE_TTL = 10 * 60 * 1000;

async function geocodeLocation(query: string): Promise<{ lat: number; lng: number; name: string } | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`,
      { headers: { "User-Agent": "SurfCast/1.0" } }
    );
    const data = await res.json();
    if (data && data.length > 0) {
      return {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon),
        name: data[0].display_name?.split(",")[0] || query,
      };
    }
  } catch {}
  return null;
}

async function fetchForecastForAI(lat: number, lng: number): Promise<string> {
  try {
    const [weatherRes, marineRes] = await Promise.all([
      fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=temperature_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m,weather_code&current=temperature_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m&timezone=auto&forecast_days=3`
      ),
      fetch(
        `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lng}&hourly=wave_height,wave_direction,wave_period,swell_wave_height,swell_wave_direction,swell_wave_period&current=wave_height,wave_direction,wave_period&timezone=auto&forecast_days=3`
      ),
    ]);
    const weather = await weatherRes.json();
    const marine = await marineRes.json();

    const current: string[] = [];
    if (weather.current) {
      current.push(`Temperature: ${weather.current.temperature_2m}°C`);
      current.push(`Wind: ${weather.current.wind_speed_10m} km/h from ${weather.current.wind_direction_10m}°`);
      if (weather.current.wind_gusts_10m) current.push(`Wind Gusts: ${weather.current.wind_gusts_10m} km/h`);
    }
    if (marine.current) {
      current.push(`Wave Height: ${marine.current.wave_height}m (${(marine.current.wave_height * 3.28).toFixed(1)}ft)`);
      current.push(`Wave Period: ${marine.current.wave_period}s`);
      current.push(`Wave Direction: ${marine.current.wave_direction}°`);
    }

    const hourly = weather.hourly;
    const marineHourly = marine.hourly;
    const forecastLines: string[] = [];
    if (hourly && marineHourly) {
      for (let i = 0; i < Math.min(72, hourly.time?.length || 0); i += 3) {
        const t = hourly.time[i];
        const wh = marineHourly.wave_height?.[i] ?? "N/A";
        const wp = marineHourly.wave_period?.[i] ?? "N/A";
        const sw = marineHourly.swell_wave_height?.[i] ?? "N/A";
        const swDir = marineHourly.swell_wave_direction?.[i] ?? "N/A";
        const ws = hourly.wind_speed_10m?.[i] ?? "N/A";
        const wg = hourly.wind_gusts_10m?.[i] ?? "N/A";
        const wd = hourly.wind_direction_10m?.[i] ?? "N/A";
        const temp = hourly.temperature_2m?.[i] ?? "N/A";
        forecastLines.push(`${t}: Waves ${wh}m, Period ${wp}s, Swell ${sw}m@${swDir}°, Wind ${ws}(gusts ${wg})km/h@${wd}°, ${temp}°C`);
      }
    }

    return `CURRENT CONDITIONS at (${lat.toFixed(2)}, ${lng.toFixed(2)}):\n${current.join("\n")}\n\n3-DAY FORECAST (every 3h):\n${forecastLines.join("\n")}`;
  } catch {
    return `Unable to fetch forecast data for (${lat}, ${lng}).`;
  }
}

interface KnownSpot {
  name: string;
  lat: number;
  lng: number;
}

const KNOWN_SURF_SPOTS: Record<string, KnownSpot> = {
  "pipeline": { name: "Pipeline, North Shore, Oahu", lat: 21.6650, lng: -158.0530 },
  "backdoor": { name: "Backdoor Pipeline, Oahu", lat: 21.6650, lng: -158.0530 },
  "sunset beach": { name: "Sunset Beach, Oahu", lat: 21.6780, lng: -158.0420 },
  "waimea": { name: "Waimea Bay, Oahu", lat: 21.6419, lng: -158.0656 },
  "north shore": { name: "North Shore, Oahu", lat: 21.5800, lng: -158.1040 },
  "teahupoo": { name: "Teahupoo, Tahiti", lat: -17.8539, lng: -149.2556 },
  "teahupo'o": { name: "Teahupoo, Tahiti", lat: -17.8539, lng: -149.2556 },
  "cloudbreak": { name: "Cloudbreak, Fiji", lat: -17.8692, lng: 177.1881 },
  "jeffreys bay": { name: "Jeffreys Bay, South Africa", lat: -33.9614, lng: 25.9519 },
  "j-bay": { name: "Jeffreys Bay, South Africa", lat: -33.9614, lng: 25.9519 },
  "supertubes": { name: "Supertubes, Jeffreys Bay", lat: -33.9614, lng: 25.9519 },
  "uluwatu": { name: "Uluwatu, Bali", lat: -8.8294, lng: 115.0851 },
  "padang padang": { name: "Padang Padang, Bali", lat: -8.8136, lng: 115.0977 },
  "keramas": { name: "Keramas, Bali", lat: -8.5875, lng: 115.4550 },
  "canggu": { name: "Canggu, Bali", lat: -8.6478, lng: 115.1385 },
  "snapper rocks": { name: "Snapper Rocks, Gold Coast", lat: -28.1693, lng: 153.5517 },
  "bells beach": { name: "Bells Beach, Victoria", lat: -38.3727, lng: 144.2817 },
  "hossegor": { name: "Hossegor, France", lat: 43.6670, lng: -1.3980 },
  "nazare": { name: "Nazare, Portugal", lat: 39.6015, lng: -9.0693 },
  "peniche": { name: "Peniche, Portugal", lat: 39.3561, lng: -9.3811 },
  "ericeira": { name: "Ericeira, Portugal", lat: 38.9631, lng: -9.4187 },
  "mundaka": { name: "Mundaka, Spain", lat: 43.4053, lng: -2.6983 },
  "trestles": { name: "Trestles, California", lat: 33.3814, lng: -117.5893 },
  "mavericks": { name: "Mavericks, California", lat: 37.4937, lng: -122.4965 },
  "rincon": { name: "Rincon, California", lat: 34.3739, lng: -119.4776 },
  "huntington beach": { name: "Huntington Beach, California", lat: 33.6553, lng: -118.0047 },
  "malibu": { name: "Malibu, California", lat: 34.0358, lng: -118.6773 },
  "blacks beach": { name: "Blacks Beach, La Jolla", lat: 32.8893, lng: -117.2534 },
  "puerto escondido": { name: "Puerto Escondido, Mexico", lat: 15.8610, lng: -97.0730 },
  "raglan": { name: "Raglan, New Zealand", lat: -37.8047, lng: 174.8619 },
  "g-land": { name: "G-Land, Java", lat: -8.7350, lng: 114.3700 },
  "desert point": { name: "Desert Point, Lombok", lat: -8.7490, lng: 115.8250 },
  "margaret river": { name: "Margaret River, Australia", lat: -33.9530, lng: 114.9963 },
  "gold coast": { name: "Gold Coast, Australia", lat: -28.1693, lng: 153.5517 },
  "byron bay": { name: "Byron Bay, Australia", lat: -28.6428, lng: 153.6120 },
  "noosa": { name: "Noosa, Australia", lat: -26.3814, lng: 153.0889 },
  "bali": { name: "Bali, Indonesia", lat: -8.8294, lng: 115.0851 },
  "hawaii": { name: "North Shore, Oahu, Hawaii", lat: 21.5800, lng: -158.1040 },
  "oahu": { name: "North Shore, Oahu", lat: 21.5800, lng: -158.1040 },
  "maui": { name: "Hookipa, Maui", lat: 20.9360, lng: -156.3560 },
  "california": { name: "Huntington Beach, California", lat: 33.6553, lng: -118.0047 },
  "portugal": { name: "Peniche, Portugal", lat: 39.3561, lng: -9.3811 },
  "france": { name: "Hossegor, France", lat: 43.6670, lng: -1.3980 },
  "morocco": { name: "Taghazout, Morocco", lat: 30.5451, lng: -9.7110 },
  "costa rica": { name: "Playa Hermosa, Costa Rica", lat: 9.5578, lng: -84.5815 },
  "nicaragua": { name: "Popoyo, Nicaragua", lat: 11.4675, lng: -86.0630 },
  "sri lanka": { name: "Arugam Bay, Sri Lanka", lat: 6.8392, lng: 81.8366 },
  "indonesia": { name: "Uluwatu, Bali", lat: -8.8294, lng: 115.0851 },
  "australia": { name: "Gold Coast, Australia", lat: -28.1693, lng: 153.5517 },
  "brazil": { name: "Itacare, Bahia, Brazil", lat: -14.2781, lng: -38.9966 },
  "south africa": { name: "Jeffreys Bay, South Africa", lat: -33.9614, lng: 25.9519 },
  "japan": { name: "Shonan, Japan", lat: 35.3126, lng: 139.4827 },
  "mexico": { name: "Puerto Escondido, Mexico", lat: 15.8610, lng: -97.0730 },
  "fiji": { name: "Cloudbreak, Fiji", lat: -17.8692, lng: 177.1881 },
  "tahiti": { name: "Teahupoo, Tahiti", lat: -17.8539, lng: -149.2556 },
  "maldives": { name: "North Male Atoll, Maldives", lat: 4.2550, lng: 73.4530 },
  "mentawai": { name: "Mentawai, Indonesia", lat: -2.0861, lng: 99.6078 },
  "taghazout": { name: "Taghazout, Morocco", lat: 30.5451, lng: -9.7110 },
  "sayulita": { name: "Sayulita, Mexico", lat: 20.8680, lng: -105.4390 },
  "santa cruz": { name: "Santa Cruz, California", lat: 36.9514, lng: -122.0263 },
  "la jolla": { name: "La Jolla, California", lat: 32.8328, lng: -117.2713 },
  "skeleton bay": { name: "Skeleton Bay, Namibia", lat: -24.7640, lng: 14.5260 },
  "punta de lobos": { name: "Punta de Lobos, Chile", lat: -34.4214, lng: -72.0453 },
};

function extractMentionedSpots(message: string): KnownSpot[] {
  const lower = message.toLowerCase();
  const found: KnownSpot[] = [];
  const seenNames = new Set<string>();
  const sortedKeys = Object.keys(KNOWN_SURF_SPOTS).sort((a, b) => b.length - a.length);
  for (const key of sortedKeys) {
    if (lower.includes(key)) {
      const spot = KNOWN_SURF_SPOTS[key];
      if (!seenNames.has(spot.name)) {
        seenNames.add(spot.name);
        found.push(spot);
      }
    }
  }
  return found;
}

export function registerRoutes(app: Express): void {
  // Surf Spots CRUD
  app.get("/api/spots", async (_req, res) => {
    try {
      const spots = await storage.getAllSpots();
      res.json(spots);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch spots" });
    }
  });

  app.post("/api/spots", async (req, res) => {
    try {
      const parsed = insertSurfSpotSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.message });
      }
      const spot = await storage.createSpot(parsed.data);
      res.status(201).json(spot);
    } catch (error) {
      res.status(500).json({ error: "Failed to create spot" });
    }
  });

  app.delete("/api/spots/:id", async (req, res) => {
    try {
      await storage.deleteSpot(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete spot" });
    }
  });

  // Forecast endpoint - proxies to Open-Meteo
  app.get("/api/forecast/:lat/:lng", async (req, res) => {
    try {
      const { lat, lng } = req.params;
      const latitude = parseFloat(lat);
      const longitude = parseFloat(lng);

      if (isNaN(latitude) || isNaN(longitude)) {
        return res.status(400).json({ error: "Invalid coordinates" });
      }

      const fKey = `${latitude.toFixed(2)},${longitude.toFixed(2)}`;
      const fCached = forecastCache.get(fKey);
      if (fCached && Date.now() - fCached.timestamp < FORECAST_CACHE_TTL) {
        return res.json(fCached.data);
      }

      const [weatherRes, marineRes] = await Promise.all([
        fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&hourly=temperature_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m,weather_code&timezone=auto&forecast_days=7`
        ),
        fetch(
          `https://marine-api.open-meteo.com/v1/marine?latitude=${latitude}&longitude=${longitude}&hourly=wave_height,wave_direction,wave_period,swell_wave_height,swell_wave_direction,swell_wave_period,wind_wave_height,wind_wave_direction,wind_wave_period&timezone=auto&forecast_days=7`
        ),
      ]);

      const weatherData = await weatherRes.json();
      const marineData = await marineRes.json();

      if (weatherData.error || marineData.error) {
        if (fCached) return res.json(fCached.data);
        return res.status(502).json({
          error: "Weather service error",
          details: weatherData.error || marineData.error,
        });
      }

      const response = {
        weather: weatherData.hourly || {
          time: [], temperature_2m: [], wind_speed_10m: [],
          wind_direction_10m: [], wind_gusts_10m: [], weather_code: []
        },
        marine: marineData.hourly || {
          time: [], wave_height: [], wave_direction: [], wave_period: [],
          swell_wave_height: [], swell_wave_direction: [], swell_wave_period: [],
          wind_wave_height: [], wind_wave_direction: [], wind_wave_period: []
        },
        latitude: weatherData.latitude || latitude,
        longitude: weatherData.longitude || longitude,
        timezone: weatherData.timezone || "UTC",
      };

      forecastCache.set(fKey, { data: response, timestamp: Date.now() });

      if (forecastCache.size > 200) {
        const oldest = Array.from(forecastCache.entries()).sort((a, b) => a[1].timestamp - b[1].timestamp);
        for (let i = 0; i < oldest.length - 100; i++) {
          forecastCache.delete(oldest[i][0]);
        }
      }

      res.json(response);
    } catch (error) {
      console.error("Forecast error:", error);
      res.status(500).json({ error: "Failed to fetch forecast" });
    }
  });

  // Grid weather data for map overlays (wind arrows + wave colors)
  app.get("/api/grid-weather", async (req, res) => {
    try {
      const { south, north, west, east } = req.query;
      const s = parseFloat(south as string);
      const n = parseFloat(north as string);
      const w = parseFloat(west as string);
      const e = parseFloat(east as string);

      if ([s, n, w, e].some(isNaN)) {
        return res.status(400).json({ error: "Invalid bounds" });
      }

      const latSpan = n - s;
      const lngSpan = e - w;
      const minSpan = 12;
      const padLat = Math.max(0, (minSpan - latSpan) / 2);
      const padLng = Math.max(0, (minSpan - lngSpan) / 2);
      const gs = Math.max(-90, s - padLat);
      const gn = Math.min(90, n + padLat);
      const gw = w - padLng;
      const ge = e + padLng;

      const gridLatSpan = gn - gs;
      const gridLngSpan = ge - gw;
      const latStep = gridLatSpan / 5;
      const lngStep = gridLngSpan / 7;

      const pairLats: number[] = [];
      const pairLngs: number[] = [];

      for (let lat = gs + latStep / 2; lat <= gn; lat += latStep) {
        for (let lng = gw + lngStep / 2; lng <= ge; lng += lngStep) {
          pairLats.push(Math.round(lat * 10) / 10);
          pairLngs.push(Math.round(lng * 10) / 10);
        }
      }

      if (pairLats.length > 35) {
        pairLats.length = 35;
        pairLngs.length = 35;
      }

      if (pairLats.length === 0) {
        return res.json({ points: [] });
      }

      const latStr = pairLats.join(",");
      const lngStr = pairLngs.join(",");
      const cacheKey = `${latStr}|${lngStr}`;

      const cached = gridWeatherCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < GRID_CACHE_TTL) {
        return res.json(cached.data);
      }

      if (Date.now() < gridRateLimitUntil) {
        if (cached) return res.json(cached.data);
        if (lastGoodGridData) return res.json(lastGoodGridData.data);
        return res.json(generateSyntheticWindData(gs, gn, gw, ge));
      }

      const [weatherRes, marineRes] = await Promise.all([
        fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${latStr}&longitude=${lngStr}&current=wind_speed_10m,wind_direction_10m,temperature_2m&timezone=auto`
        ),
        fetch(
          `https://marine-api.open-meteo.com/v1/marine?latitude=${latStr}&longitude=${lngStr}&current=wave_height,wave_direction,wave_period&timezone=auto`
        ),
      ]);

      const weatherData = await weatherRes.json();
      const marineData = await marineRes.json();

      if (weatherData.error) {
        gridRateLimitUntil = Date.now() + 60_000;
        if (cached) return res.json(cached.data);
        if (lastGoodGridData) return res.json(lastGoodGridData.data);
        return res.json(generateSyntheticWindData(gs, gn, gw, ge));
      }

      const points: any[] = [];

      const weatherArr = Array.isArray(weatherData) ? weatherData : [weatherData];
      const marineArr = Array.isArray(marineData) ? marineData : [marineData];

      for (let i = 0; i < weatherArr.length; i++) {
        const wd = weatherArr[i];
        const md = marineArr[i];
        if (wd && wd.current) {
          points.push({
            lat: wd.latitude,
            lng: wd.longitude,
            windSpeed: wd.current.wind_speed_10m || 0,
            windDir: wd.current.wind_direction_10m || 0,
            temp: wd.current.temperature_2m || 0,
            waveHeight: md?.current?.wave_height ?? null,
            waveDir: md?.current?.wave_direction ?? null,
            wavePeriod: md?.current?.wave_period ?? null,
          });
        }
      }

      const result = { points };
      gridWeatherCache.set(cacheKey, { data: result, timestamp: Date.now() });
      lastGoodGridData = { data: result, timestamp: Date.now() };

      if (gridWeatherCache.size > 100) {
        const oldest = Array.from(gridWeatherCache.entries()).sort((a, b) => a[1].timestamp - b[1].timestamp);
        for (let i = 0; i < oldest.length - 50; i++) {
          gridWeatherCache.delete(oldest[i][0]);
        }
      }

      res.json(result);
    } catch (error) {
      console.error("Grid weather error:", error);
      if (lastGoodGridData) return res.json(lastGoodGridData.data);
      const { south, north, west, east } = req.query;
      const s2 = parseFloat(south as string) || -30;
      const n2 = parseFloat(north as string) || 50;
      const w2 = parseFloat(west as string) || -130;
      const e2 = parseFloat(east as string) || -60;
      res.json(generateSyntheticWindData(s2, n2, w2, e2));
    }
  });

  // Webcams - Windy Webcams API (beach category)
  app.get("/api/webcams", async (req, res) => {
    try {
      const { south, north, west, east } = req.query;
      const s = parseFloat(south as string);
      const n = parseFloat(north as string);
      const w = parseFloat(west as string);
      const e2 = parseFloat(east as string);

      if ([s, n, w, e2].some(isNaN)) {
        return res.status(400).json({ error: "Invalid bounds" });
      }

      const apiKey = process.env.Windy_Webcams_API;
      if (!apiKey) {
        return res.status(500).json({ error: "Webcam API key not configured" });
      }

      const BEACH_CATEGORIES = new Set(["beach", "coast"]);
      const PAGE_SIZE = 50;
      const QUERY_RADIUS = 25;

      const latSpan = n - s;
      const lngSpan = e2 - w;
      const latStepDeg = (QUERY_RADIUS * 1.5) / 111;
      const avgLat = (s + n) / 2;
      const lngStepDeg = (QUERY_RADIUS * 1.5) / (111 * Math.cos(avgLat * Math.PI / 180));

      const latSteps = Math.max(1, Math.ceil(latSpan / latStepDeg));
      const lngSteps = Math.max(1, Math.ceil(lngSpan / lngStepDeg));
      const totalCells = latSteps * lngSteps;

      const points: { lat: number; lng: number }[] = [];
      if (totalCells <= 6) {
        for (let li = 0; li < latSteps; li++) {
          for (let lj = 0; lj < lngSteps; lj++) {
            points.push({
              lat: s + (li + 0.5) * (latSpan / latSteps),
              lng: w + (lj + 0.5) * (lngSpan / lngSteps),
            });
          }
        }
      } else {
        points.push({ lat: avgLat, lng: (w + e2) / 2 });
      }

      const fetchBeachCams = async (lat: number, lng: number, rad: number) => {
        const allBeach: any[] = [];
        const firstUrl = `https://api.windy.com/webcams/api/v3/webcams?nearby=${lat},${lng},${rad}&include=images,location,player,categories&limit=${PAGE_SIZE}&offset=0&lang=en`;
        const firstResp = await fetch(firstUrl, { headers: { "x-windy-api-key": apiKey } });
        if (!firstResp.ok) return [];
        const firstData = await firstResp.json();
        const total = firstData.total || 0;

        const allPages = [firstData];
        const extraPages = Math.min(3, Math.ceil(Math.min(total, 200) / PAGE_SIZE) - 1);
        if (extraPages > 0) {
          const extras = await Promise.all(
            Array.from({ length: extraPages }, (_, i) => {
              const url = `https://api.windy.com/webcams/api/v3/webcams?nearby=${lat},${lng},${rad}&include=images,location,player,categories&limit=${PAGE_SIZE}&offset=${(i + 1) * PAGE_SIZE}&lang=en`;
              return fetch(url, { headers: { "x-windy-api-key": apiKey } }).then(r => r.ok ? r.json() : { webcams: [] });
            })
          );
          allPages.push(...extras);
        }

        for (const page of allPages) {
          for (const cam of (page.webcams || [])) {
            const cats = cam.categories || [];
            if (cats.some((c: any) => BEACH_CATEGORIES.has(c.id))) {
              allBeach.push(cam);
            }
          }
        }
        return allBeach;
      };

      const effectiveRadius = totalCells <= 6 ? QUERY_RADIUS : Math.min(250, Math.max(10, Math.ceil(Math.sqrt(
        ((n - s) * 111) ** 2 + ((e2 - w) * 111 * Math.cos(avgLat * Math.PI / 180)) ** 2
      ) / 2)));

      const results = await Promise.all(
        points.map(p => fetchBeachCams(p.lat, p.lng, totalCells <= 6 ? QUERY_RADIUS : effectiveRadius))
      );

      const seen = new Set<number>();
      const webcams = results.flat()
        .filter((cam: any) => {
          if (!cam.webcamId || seen.has(cam.webcamId)) return false;
          seen.add(cam.webcamId);
          const lat = cam.location?.latitude;
          const lng = cam.location?.longitude;
          return lat != null && lng != null && lat >= s && lat <= n && lng >= w && lng <= e2;
        })
        .map((cam: any) => ({
          id: cam.webcamId,
          title: cam.title,
          lat: cam.location?.latitude,
          lng: cam.location?.longitude,
          city: cam.location?.city,
          country: cam.location?.country,
          thumbnail: cam.images?.current?.preview || cam.images?.current?.thumbnail || cam.images?.current?.icon,
          player: cam.player?.lifetime?.day || cam.player?.lifetime?.month || null,
        }));

      res.json({ webcams });
    } catch (error) {
      console.error("Webcams error:", error);
      res.status(500).json({ error: "Failed to fetch webcams" });
    }
  });

  app.get("/api/sessions", async (_req, res) => {
    try {
      const sessions = await storage.getAllSessions();
      res.json(sessions);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch sessions" });
    }
  });

  app.post("/api/sessions", async (req, res) => {
    try {
      const parsed = insertSurfSessionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.message });
      }
      const session = await storage.createSession(parsed.data);
      res.status(201).json(session);
    } catch (error) {
      res.status(500).json({ error: "Failed to create session" });
    }
  });

  app.get("/api/sessions/:id", async (req, res) => {
    try {
      const session = await storage.getSession(req.params.id);
      if (!session) return res.status(404).json({ error: "Session not found" });
      res.json(session);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch session" });
    }
  });

  app.delete("/api/sessions/:id", async (req, res) => {
    try {
      await storage.deleteSession(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete session" });
    }
  });

  // AI Surf Chat
  app.post("/api/chat", async (req, res) => {
    try {
      const { message, conversationId, latitude, longitude, locationName: clientLocationName, forecastData: clientForecastData } = req.body;

      if (!message || typeof message !== "string") {
        return res.status(400).json({ error: "Message is required" });
      }

      let convId = conversationId ? parseInt(conversationId) : null;
      if (convId && isNaN(convId)) convId = null;

      if (!convId) {
        const conv = await storage.createConversation("Surf Chat");
        convId = conv.id;
      }

      await storage.createMessage(convId, "user", message);

      const history = await storage.getMessagesByConversation(convId);

      const spots = await storage.getAllSpots();
      const spotListText = spots.map(s =>
        `- ${s.name} (${s.latitude}, ${s.longitude})${s.difficulty ? ` [${s.difficulty}]` : ""}${s.description ? `: ${s.description}` : ""}`
      ).join("\n");

      let forecastContext = "";
      let currentViewLocation = clientLocationName || "";

      if (clientForecastData && clientLocationName) {
        try {
          const fd = clientForecastData;
          const w = fd.weather;
          const m = fd.marine;
          if (w && m) {
            const now = new Date();
            const idx = w.time ? Math.max(0, w.time.findIndex((t: string) => new Date(t) >= now) - 1) : 0;
            const ci = Math.max(0, idx);
            const lines = [
              `Location: ${clientLocationName} (${latitude?.toFixed(2)}, ${longitude?.toFixed(2)})`,
              `Current conditions the user is viewing on the map:`,
              `  Wind: ${w.wind_speed_10m?.[ci]?.toFixed(1) ?? "?"} mph from ${w.wind_direction_10m?.[ci] ?? "?"}°, gusts ${w.wind_gusts_10m?.[ci]?.toFixed(1) ?? "?"} mph`,
              `  Temperature: ${w.temperature_2m?.[ci]?.toFixed(1) ?? "?"}°F`,
              `  Wave Height: ${m.wave_height?.[ci]?.toFixed(1) ?? "?"} ft`,
              `  Wave Direction: ${m.wave_direction?.[ci] ?? "?"}°, Period: ${m.wave_period?.[ci]?.toFixed(1) ?? "?"}s`,
              `  Swell Height: ${m.swell_wave_height?.[ci]?.toFixed(1) ?? "?"} ft`,
              `  Swell Direction: ${m.swell_wave_direction?.[ci] ?? "?"}°, Period: ${m.swell_wave_period?.[ci]?.toFixed(1) ?? "?"}s`,
            ];
            if (w.time && w.time.length > ci + 6) {
              lines.push(`  Next 6 hours forecast:`);
              for (let h = 1; h <= 6; h++) {
                const fi = ci + h;
                if (fi < w.time.length) {
                  lines.push(`    ${new Date(w.time[fi]).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}: Wind ${w.wind_speed_10m?.[fi]?.toFixed(0)} mph, Waves ${m.wave_height?.[fi]?.toFixed(1)} ft, Period ${m.wave_period?.[fi]?.toFixed(0)}s`);
                }
              }
            }
            forecastContext = lines.join("\n");
          }
        } catch {
          // fall back to API fetch
        }
      }

      if (!forecastContext && latitude != null && longitude != null && !isNaN(latitude) && !isNaN(longitude)) {
        forecastContext = await fetchForecastForAI(latitude, longitude);
      }

      const locationForecasts: string[] = [];

      const savedSpotMatch = spots.find(s => message.toLowerCase().includes(s.name.toLowerCase()));
      if (savedSpotMatch) {
        const data = await fetchForecastForAI(savedSpotMatch.latitude, savedSpotMatch.longitude);
        if (data) locationForecasts.push(`\n--- Real-time forecast for ${savedSpotMatch.name} (${savedSpotMatch.latitude}, ${savedSpotMatch.longitude}) ---\n${data}`);
      }

      const mentionedSpots = extractMentionedSpots(message);
      let primaryLocation = "";
      const usedCoords = new Set<string>();
      if (savedSpotMatch) {
        usedCoords.add(`${savedSpotMatch.latitude.toFixed(1)},${savedSpotMatch.longitude.toFixed(1)}`);
        primaryLocation = savedSpotMatch.name;
      }

      const uniqueSpots = mentionedSpots.filter(spot => {
        const coordKey = `${spot.lat.toFixed(1)},${spot.lng.toFixed(1)}`;
        if (usedCoords.has(coordKey)) return false;
        usedCoords.add(coordKey);
        return true;
      });

      if (uniqueSpots.length > 0 && !primaryLocation) {
        primaryLocation = uniqueSpots[0].name;
      }

      const spotFetchPromises = uniqueSpots.slice(0, 3).map(async (spot) => {
        const data = await fetchForecastForAI(spot.lat, spot.lng);
        if (data) return `\n--- Real-time forecast for ${spot.name} (${spot.lat.toFixed(2)}, ${spot.lng.toFixed(2)}) ---\n${data}`;
        return null;
      });
      const spotResults = await Promise.all(spotFetchPromises);
      locationForecasts.push(...spotResults.filter((r): r is string => r !== null));

      if (mentionedSpots.length === 0 && !savedSpotMatch) {
        const cleaned = message.replace(/how|are|is|the|conditions|in|at|right|now|today|tomorrow|what|about|like|forecast|for|surf|waves|surfing|good|bad|check/gi, "").trim();
        if (cleaned.length > 2) {
          const geo = await geocodeLocation(cleaned);
          if (geo) {
            const data = await fetchForecastForAI(geo.lat, geo.lng);
            if (data) {
              locationForecasts.push(`\n--- Real-time forecast for ${geo.name} (${geo.lat.toFixed(2)}, ${geo.lng.toFixed(2)}) ---\n${data}`);
              primaryLocation = geo.name;
            }
          }
        }
      }

      if (locationForecasts.length === 0 && !forecastContext) {
        const generalTerms = ["surf", "waves", "conditions", "forecast", "today", "tomorrow", "weekend", "best", "where", "when", "should i"];
        const isGeneralSurfQ = generalTerms.some(t => message.toLowerCase().includes(t));
        if (isGeneralSurfQ && spots.length > 0) {
          const spotsToCheck = spots.slice(0, 5);
          const forecasts = await Promise.all(
            spotsToCheck.map(async (s) => {
              const data = await fetchForecastForAI(s.latitude, s.longitude);
              return data ? `\n--- Real-time forecast for ${s.name} (${s.latitude}, ${s.longitude}) ---\n${data}` : "";
            })
          );
          locationForecasts.push(...forecasts.filter(Boolean));
        }
      }

      const systemPrompt = `You are SurfCast AI — a friendly, knowledgeable surf companion who genuinely loves the ocean and helping people find great waves. You're like chatting with a well-traveled surf buddy who knows every break.
${primaryLocation ? `\nUSER ASKED ABOUT: ${primaryLocation}\n` : ""}
SURF KNOWLEDGE:
- Offshore wind (blowing from land to sea) = clean, groomed faces. Onshore = messy, choppy.
- Cross-shore can still be surfable. Light winds (<10 mph) are usually fine either way.
- Swell period 12s+ = powerful groundswell (long-traveled, clean energy). <8s = weak wind chop.
- Wave height in feet = meters x 3.28. Groundswell hits harder than wind swell of the same height.

SAVED SPOTS: ${spotListText || "None saved yet."}

${forecastContext ? `CURRENTLY VIEWING ON MAP (the user has this forecast panel open right now):\n${forecastContext}\n` : ""}${locationForecasts.length > 0 ? `ADDITIONAL FORECAST DATA:\n${locationForecasts.join("\n")}` : ""}

PERSONALITY & STYLE:
- Be warm, conversational, and enthusiastic — like a surf buddy, not a weather robot.
- Keep answers concise but interesting. Around 6-10 lines is ideal. Don't write essays.
- Start with a clear quality rating: **EPIC** / **GOOD** / **FAIR** / **POOR** / **FLAT**
- Quote the key numbers naturally: wave height (ft), wind speed & direction, swell period.
- Share interesting local knowledge — mention what type of break it is, what board would suit the conditions, or what the vibe is like.
- When conditions are poor or flat, be honest but encouraging:
  * Suggest a better time window from the forecast data (e.g. "Tomorrow morning looks way better")
  * Recommend nearby alternative spots that might be picking up more swell or have better wind protection
  * Mention if it's still good for longboarding, SUP, or beginners even if shortboarders would skip it
- Remember what the user asked earlier in the conversation and build on it. Reference previous topics naturally.
- ONLY use real numbers from the forecast data above. Never invent conditions.
- If "CURRENTLY VIEWING ON MAP" data is provided, always reference it when the user asks general questions like "how are conditions?" or "should I go out?" — they're asking about what they see on the map right now.
- If no forecast data is available, warmly ask them to click a spot on the map or name a specific beach so you can pull real data.
- Feel free to use surf lingo naturally (lineup, glassy, peaky, barreling, mushy, etc.) but keep it accessible.`;

      const chatMessages: { role: "system" | "user" | "assistant"; content: string }[] = [
        { role: "system", content: systemPrompt },
      ];

      for (const msg of history) {
        chatMessages.push({
          role: msg.role as "user" | "assistant",
          content: msg.content,
        });
      }

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      res.write(`data: ${JSON.stringify({ type: "conversation", id: convId })}\n\n`);

      const stream = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: chatMessages,
        stream: true,
        max_completion_tokens: 600,
      });

      let fullResponse = "";

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || "";
        if (content) {
          fullResponse += content;
          res.write(`data: ${JSON.stringify({ type: "content", content })}\n\n`);
        }
      }

      await storage.createMessage(convId, "assistant", fullResponse);

      res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
      res.end();
    } catch (error) {
      console.error("Chat error:", error);
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ type: "error", error: "Failed to generate response" })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: "Failed to process chat" });
      }
    }
  });

  app.delete("/api/chat/:conversationId", async (req, res) => {
    try {
      await storage.deleteConversation(parseInt(req.params.conversationId));
      res.status(204).send();
    } catch {
      res.status(500).json({ error: "Failed to delete conversation" });
    }
  });
}
