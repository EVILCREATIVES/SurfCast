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

  return httpServer;
}
