import { sql } from "drizzle-orm";
import { pgTable, text, varchar, doublePrecision, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const surfSpots = pgTable("surf_spots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  latitude: doublePrecision("latitude").notNull(),
  longitude: doublePrecision("longitude").notNull(),
  description: text("description"),
  difficulty: text("difficulty"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertSurfSpotSchema = createInsertSchema(surfSpots).omit({
  id: true,
  createdAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertSurfSpot = z.infer<typeof insertSurfSpotSchema>;
export type SurfSpot = typeof surfSpots.$inferSelect;

export interface WeatherData {
  time: string[];
  temperature_2m: number[];
  wind_speed_10m: number[];
  wind_direction_10m: number[];
  wind_gusts_10m: number[];
  weather_code: number[];
}

export interface MarineData {
  time: string[];
  wave_height: number[];
  wave_direction: number[];
  wave_period: number[];
  swell_wave_height: number[];
  swell_wave_direction: number[];
  swell_wave_period: number[];
  wind_wave_height: number[];
  wind_wave_direction: number[];
  wind_wave_period: number[];
}

export interface ForecastResponse {
  weather: WeatherData;
  marine: MarineData;
  latitude: number;
  longitude: number;
  timezone: string;
}
