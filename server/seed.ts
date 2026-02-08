import { db } from "./db";
import { surfSpots } from "@shared/schema";

const defaultSpots = [
  {
    name: "Pipeline",
    latitude: 21.665,
    longitude: -158.053,
    description: "World-famous left-breaking wave on Oahu's North Shore, known for its powerful barrels.",
    difficulty: "expert",
  },
  {
    name: "Bells Beach",
    latitude: -38.373,
    longitude: 144.278,
    description: "Iconic point break in Victoria, Australia. Home of the Rip Curl Pro.",
    difficulty: "advanced",
  },
  {
    name: "Hossegor - La Graviere",
    latitude: 43.665,
    longitude: -1.441,
    description: "Heavy beach break in southwest France, one of Europe's best barrels.",
    difficulty: "advanced",
  },
  {
    name: "Trestles",
    latitude: 33.382,
    longitude: -117.588,
    description: "High-performance cobblestone point break in Southern California.",
    difficulty: "intermediate",
  },
  {
    name: "Waikiki",
    latitude: 21.271,
    longitude: -157.827,
    description: "Gentle, rolling waves perfect for learning. The birthplace of modern surfing.",
    difficulty: "beginner",
  },
];

export async function seedDatabase() {
  try {
    const existing = await db.select().from(surfSpots);
    if (existing.length === 0) {
      await db.insert(surfSpots).values(defaultSpots);
      console.log("Seeded database with default surf spots");
    }
  } catch (error) {
    console.error("Seed error:", error);
  }
}
