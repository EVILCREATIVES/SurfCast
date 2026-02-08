import { type User, type InsertUser, type SurfSpot, type InsertSurfSpot, users, surfSpots } from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getAllSpots(): Promise<SurfSpot[]>;
  getSpot(id: string): Promise<SurfSpot | undefined>;
  createSpot(spot: InsertSurfSpot): Promise<SurfSpot>;
  deleteSpot(id: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async getAllSpots(): Promise<SurfSpot[]> {
    return db.select().from(surfSpots);
  }

  async getSpot(id: string): Promise<SurfSpot | undefined> {
    const [spot] = await db.select().from(surfSpots).where(eq(surfSpots.id, id));
    return spot;
  }

  async createSpot(spot: InsertSurfSpot): Promise<SurfSpot> {
    const [created] = await db.insert(surfSpots).values(spot).returning();
    return created;
  }

  async deleteSpot(id: string): Promise<void> {
    await db.delete(surfSpots).where(eq(surfSpots.id, id));
  }
}

export const storage = new DatabaseStorage();
