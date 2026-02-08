import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertSurfSpotSchema } from "@shared/schema";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

async function fetchForecastForAI(lat: number, lng: number): Promise<string> {
  try {
    const [weatherRes, marineRes] = await Promise.all([
      fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=temperature_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m,weather_code&current=temperature_2m,wind_speed_10m,wind_direction_10m&timezone=auto&forecast_days=3`
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
        const ws = hourly.wind_speed_10m?.[i] ?? "N/A";
        const wd = hourly.wind_direction_10m?.[i] ?? "N/A";
        const temp = hourly.temperature_2m?.[i] ?? "N/A";
        forecastLines.push(`${t}: Waves ${wh}m, Period ${wp}s, Swell ${sw}m, Wind ${ws}km/h@${wd}°, Temp ${temp}°C`);
      }
    }

    return `CURRENT CONDITIONS at (${lat}, ${lng}):\n${current.join("\n")}\n\n3-DAY FORECAST (every 3 hours):\n${forecastLines.join("\n")}`;
  } catch {
    return `Unable to fetch forecast data for (${lat}, ${lng}). Please try again.`;
  }
}

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

  // AI Surf Chat
  app.post("/api/chat", async (req, res) => {
    try {
      const { message, conversationId, latitude, longitude } = req.body;

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
      if (latitude != null && longitude != null && !isNaN(latitude) && !isNaN(longitude)) {
        forecastContext = await fetchForecastForAI(latitude, longitude);
      }

      const nearbyForecasts: string[] = [];
      const lowerMsg = message.toLowerCase();
      const locationMentioned = spots.find(s => lowerMsg.includes(s.name.toLowerCase()));
      if (locationMentioned) {
        const data = await fetchForecastForAI(locationMentioned.latitude, locationMentioned.longitude);
        nearbyForecasts.push(`\n--- Forecast for ${locationMentioned.name} ---\n${data}`);
      }

      const systemPrompt = `You are SurfCast AI, an expert surf forecaster and surf travel advisor. You provide real, data-driven surf advice based on actual weather and marine forecast data.

YOUR KNOWLEDGE:
- You understand swell direction, wave period, wind effects on surf quality (offshore vs onshore), tide impacts, and how these factors create good or bad surfing conditions.
- You know popular surf regions worldwide and can suggest spots based on conditions.
- Wave height in feet: multiply meters by 3.28. 
- Offshore wind (blowing from land to sea) = clean waves. Onshore wind = choppy.
- Longer wave periods (12s+) = more powerful, well-organized swells.
- Swell direction matters: spots need swell from the right angle to work.

SAVED SURF SPOTS IN THE APP:
${spotListText || "No spots saved yet."}

${forecastContext ? `CURRENT FORECAST DATA (user's current map view):\n${forecastContext}` : ""}
${nearbyForecasts.length > 0 ? nearbyForecasts.join("\n") : ""}

RULES:
- Always use REAL forecast data provided above. Never invent conditions.
- If asked about a location not in the data, offer to check it if coordinates are provided, or suggest well-known nearby spots.
- Give specific, actionable advice: best time windows, which direction the swell is coming from, wind conditions, etc.
- Keep responses concise but informative. Use bullet points for forecasts.
- When suggesting spots, explain WHY conditions suit that spot.
- If you don't have forecast data for a requested location, say so honestly and suggest the user search for it on the map.`;

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
        model: "gpt-4o-mini",
        messages: chatMessages,
        stream: true,
        max_tokens: 1024,
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

  return httpServer;
}
