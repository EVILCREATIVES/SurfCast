import { db } from "./db";
import { surfSpots, surfSessions, users } from "../shared/schema";
import type { SessionTrackData } from "../shared/schema";

const defaultSpots = [
  // Hawaii
  { name: "Pipeline", latitude: 21.665, longitude: -158.053, description: "World-famous left-breaking wave on Oahu's North Shore, known for powerful barrels over shallow reef.", difficulty: "expert" },
  { name: "Waikiki", latitude: 21.271, longitude: -157.827, description: "Gentle, rolling waves perfect for learning. The birthplace of modern surfing.", difficulty: "beginner" },
  { name: "Jaws (Pe'ahi)", latitude: 20.948, longitude: -156.289, description: "Massive big wave spot on Maui's north shore. Tow-in surfing only.", difficulty: "expert" },
  // California
  { name: "Mavericks", latitude: 37.495, longitude: -122.497, description: "World-renowned big wave break in Half Moon Bay, California. Waves can reach 60+ feet.", difficulty: "expert" },
  { name: "Trestles", latitude: 33.382, longitude: -117.588, description: "High-performance cobblestone point break in Southern California.", difficulty: "intermediate" },
  { name: "Rincon", latitude: 34.374, longitude: -119.476, description: "The Queen of the Coast. Classic right-hand point break in Santa Barbara.", difficulty: "intermediate" },
  { name: "Huntington Beach", latitude: 33.655, longitude: -118.005, description: "Surf City USA. Consistent beach break with good year-round waves.", difficulty: "beginner" },
  { name: "Steamer Lane", latitude: 36.951, longitude: -122.025, description: "Iconic Santa Cruz surf spot with multiple breaks and consistent waves.", difficulty: "advanced" },
  // Mexico
  { name: "Puerto Escondido", latitude: 15.869, longitude: -97.072, description: "The Mexican Pipeline. Heavy beach break known for massive barrels.", difficulty: "expert" },
  // Central America
  { name: "Playa Hermosa, Costa Rica", latitude: 9.558, longitude: -84.583, description: "Powerful beach break with consistent swells. Great for intermediate to advanced surfers.", difficulty: "advanced" },
  // South America
  { name: "Chicama", latitude: -7.842, longitude: -79.441, description: "The longest left-hand wave in the world, located in Peru. Rides can last over 2 minutes.", difficulty: "intermediate" },
  // Europe
  { name: "Hossegor - La Graviere", latitude: 43.665, longitude: -1.441, description: "Heavy beach break in southwest France, one of Europe's best barrels.", difficulty: "advanced" },
  { name: "Nazare", latitude: 39.601, longitude: -9.070, description: "Big wave capital of the world. Waves have been surfed at 80+ feet here.", difficulty: "expert" },
  { name: "Supertubos", latitude: 39.351, longitude: -9.371, description: "Portugal's most powerful beach break. Heavy barrels on the Silver Coast.", difficulty: "advanced" },
  { name: "Mundaka", latitude: 43.407, longitude: -2.698, description: "World-class left-hand river mouth break in the Basque Country, Spain.", difficulty: "advanced" },
  { name: "Thurso East", latitude: 58.596, longitude: -3.511, description: "Scotland's most famous reef break. Cold water perfection in the far north.", difficulty: "advanced" },
  { name: "Bundoran", latitude: 54.472, longitude: -8.278, description: "Ireland's surf capital with multiple reef and beach breaks.", difficulty: "intermediate" },
  // Africa
  { name: "Jeffreys Bay", latitude: -34.047, longitude: 24.929, description: "One of the best right-hand point breaks on the planet, in South Africa.", difficulty: "advanced" },
  { name: "Skeleton Bay", latitude: -25.025, longitude: 14.578, description: "Ultra-long left barrel in Namibia's desert coast. One of the longest barrels on Earth.", difficulty: "expert" },
  // Australia & Pacific
  { name: "Bells Beach", latitude: -38.373, longitude: 144.278, description: "Iconic point break in Victoria, Australia. Home of the Rip Curl Pro since 1973.", difficulty: "advanced" },
  { name: "Snapper Rocks", latitude: -28.166, longitude: 153.553, description: "Gold Coast super bank producing machine-like right barrels.", difficulty: "advanced" },
  { name: "Cloudbreak", latitude: -17.862, longitude: 177.205, description: "Fiji's world-class reef break. Powerful left barrels over coral.", difficulty: "expert" },
  { name: "Teahupo'o", latitude: -17.868, longitude: -149.258, description: "Tahiti's heavy, thick-lipped left barrel over extremely shallow reef. Olympic venue.", difficulty: "expert" },
  // Asia
  { name: "Uluwatu", latitude: -8.815, longitude: 115.085, description: "Bali's premier left-hand reef break beneath dramatic cliff temples.", difficulty: "advanced" },
  { name: "Desert Point", latitude: -8.744, longitude: 115.827, description: "Legendary left barrel on Lombok, Indonesia. One of the most perfect waves in the world.", difficulty: "expert" },
  { name: "Cloud 9, Siargao", latitude: 9.852, longitude: 126.161, description: "Philippines' world-class reef break. Perfect barrels with warm water.", difficulty: "advanced" },
  // Indian Ocean
  { name: "Coxos", latitude: 39.229, longitude: -9.405, description: "Portugal's premier right-hand reef break near Ericeira.", difficulty: "advanced" },
];

function generateSilverStrandSession(): SessionTrackData {
  const baseLat = 32.6305;
  const baseLng = -117.1420;

  const paddlePath: { lat: number; lng: number; time: number }[] = [];
  const waves: { points: { lat: number; lng: number; time: number; speed?: number }[] }[] = [];

  let t = 0;
  const addPaddle = (lat: number, lng: number) => {
    paddlePath.push({ lat, lng, time: t });
    t += 20;
  };

  addPaddle(baseLat, baseLng);
  addPaddle(baseLat + 0.0004, baseLng - 0.0002);
  addPaddle(baseLat + 0.0010, baseLng - 0.0006);
  addPaddle(baseLat + 0.0016, baseLng - 0.0009);
  addPaddle(baseLat + 0.0022, baseLng - 0.0007);
  addPaddle(baseLat + 0.0028, baseLng - 0.0005);

  const waveConfigs = [
    { startLat: baseLat + 0.0030, startLng: baseLng - 0.0008, dirLat: -0.0006, dirLng: 0.0005, pts: 8, speed: 13.3 },
    { startLat: baseLat + 0.0032, startLng: baseLng - 0.0012, dirLat: -0.0005, dirLng: 0.0006, pts: 8, speed: 13.2 },
    { startLat: baseLat + 0.0028, startLng: baseLng - 0.0004, dirLat: -0.0007, dirLng: 0.0004, pts: 10, speed: 15.1 },
    { startLat: baseLat + 0.0035, startLng: baseLng - 0.0010, dirLat: -0.0005, dirLng: 0.0005, pts: 7, speed: 11.8 },
    { startLat: baseLat + 0.0026, startLng: baseLng - 0.0006, dirLat: -0.0006, dirLng: 0.0006, pts: 9, speed: 14.5 },
    { startLat: baseLat + 0.0033, startLng: baseLng - 0.0003, dirLat: -0.0004, dirLng: 0.0005, pts: 6, speed: 10.2 },
    { startLat: baseLat + 0.0029, startLng: baseLng - 0.0011, dirLat: -0.0006, dirLng: 0.0004, pts: 11, speed: 16.7 },
    { startLat: baseLat + 0.0036, startLng: baseLng - 0.0007, dirLat: -0.0005, dirLng: 0.0006, pts: 7, speed: 12.4 },
    { startLat: baseLat + 0.0024, startLng: baseLng - 0.0009, dirLat: -0.0007, dirLng: 0.0005, pts: 9, speed: 18.4 },
    { startLat: baseLat + 0.0031, startLng: baseLng - 0.0005, dirLat: -0.0005, dirLng: 0.0004, pts: 8, speed: 13.9 },
    { startLat: baseLat + 0.0027, startLng: baseLng - 0.0013, dirLat: -0.0006, dirLng: 0.0006, pts: 7, speed: 11.1 },
    { startLat: baseLat + 0.0034, startLng: baseLng - 0.0004, dirLat: -0.0004, dirLng: 0.0005, pts: 6, speed: 9.8 },
  ];

  for (const cfg of waveConfigs) {
    const wavePoints: { lat: number; lng: number; time: number; speed?: number }[] = [];

    for (let i = 0; i < cfg.pts; i++) {
      const frac = i / (cfg.pts - 1);
      const jitter = 0.00003;
      wavePoints.push({
        lat: cfg.startLat + cfg.dirLat * frac + (Math.random() - 0.5) * jitter,
        lng: cfg.startLng + cfg.dirLng * frac + (Math.random() - 0.5) * jitter,
        time: t,
        speed: cfg.speed * (1 - frac * 0.25),
      });
      t += 2;
    }
    waves.push({ points: wavePoints });

    addPaddle(cfg.startLat - 0.0003, cfg.startLng + 0.0002);
    addPaddle(cfg.startLat, cfg.startLng);
  }

  return { paddlePath, waves };
}

export async function seedDatabase() {
  try {
    const existing = await db.select().from(surfSpots);
    if (existing.length <= 5) {
      if (existing.length > 0) {
        const { sql } = await import("drizzle-orm");
        await db.delete(surfSpots);
      }
      await db.insert(surfSpots).values(defaultSpots);
      console.log(`Seeded database with ${defaultSpots.length} surf spots`);
    }

    const existingUsers = await db.select().from(users);
    if (existingUsers.length === 0) {
      await db.insert(users).values({
        username: "1234@surfcast",
        password: "onlywater",
      });
      console.log("Seeded test user account");
    }

    const existingSessions = await db.select().from(surfSessions);
    if (existingSessions.length === 0) {
      const trackData = generateSilverStrandSession();
      await db.insert(surfSessions).values({
        spotName: "Silver Strand",
        latitude: 32.6305,
        longitude: -117.1420,
        sessionDate: new Date("2026-02-09T09:57:00"),
        waterTimeMinutes: 122,
        waveCount: 12,
        distanceMiles: 1.2,
        longestWaveSeconds: 503,
        maxSpeed: 18.4,
        trackData: trackData as any,
      });
      console.log("Seeded database with 1 example surf session");
    }
  } catch (error) {
    console.error("Seed error:", error);
  }
}
