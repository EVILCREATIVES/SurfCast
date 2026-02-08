import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertSurfSpotSchema } from "@shared/schema";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
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
      const latStep = gridLatSpan / 6;
      const lngStep = gridLngSpan / 8;

      const pairLats: number[] = [];
      const pairLngs: number[] = [];

      for (let lat = gs + latStep / 2; lat <= gn; lat += latStep) {
        for (let lng = gw + lngStep / 2; lng <= ge; lng += lngStep) {
          pairLats.push(Math.round(lat * 100) / 100);
          pairLngs.push(Math.round(lng * 100) / 100);
        }
      }

      // Limit to 50 points max to stay within API limits
      if (pairLats.length > 50) {
        pairLats.length = 50;
        pairLngs.length = 50;
      }

      if (pairLats.length === 0) {
        return res.json({ points: [] });
      }

      const latStr = pairLats.join(",");
      const lngStr = pairLngs.join(",");

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

      res.json({ points });
    } catch (error) {
      console.error("Grid weather error:", error);
      res.status(500).json({ error: "Failed to fetch grid data" });
    }
  });

  return httpServer;
}
