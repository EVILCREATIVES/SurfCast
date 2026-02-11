import { type User, type InsertUser, type SurfSpot, type InsertSurfSpot, type SurfSession, type InsertSurfSession, type Conversation, type Message, users, surfSpots, surfSessions, conversations, messages } from "../shared/schema";
import { getDb } from "./db";

const db = getDb();
import { eq, desc } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getAllSpots(): Promise<SurfSpot[]>;
  getSpot(id: string): Promise<SurfSpot | undefined>;
  createSpot(spot: InsertSurfSpot): Promise<SurfSpot>;
  deleteSpot(id: string): Promise<void>;
  getAllSessions(): Promise<SurfSession[]>;
  getSession(id: string): Promise<SurfSession | undefined>;
  createSession(session: InsertSurfSession): Promise<SurfSession>;
  deleteSession(id: string): Promise<void>;
  createConversation(title: string): Promise<Conversation>;
  getConversation(id: number): Promise<Conversation | undefined>;
  getMessagesByConversation(conversationId: number): Promise<Message[]>;
  createMessage(conversationId: number, role: string, content: string): Promise<Message>;
  deleteConversation(id: number): Promise<void>;
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

  async createConversation(title: string): Promise<Conversation> {
    const [conv] = await db.insert(conversations).values({ title }).returning();
    return conv;
  }

  async getConversation(id: number): Promise<Conversation | undefined> {
    const [conv] = await db.select().from(conversations).where(eq(conversations.id, id));
    return conv;
  }

  async getMessagesByConversation(conversationId: number): Promise<Message[]> {
    return db.select().from(messages).where(eq(messages.conversationId, conversationId)).orderBy(messages.createdAt);
  }

  async createMessage(conversationId: number, role: string, content: string): Promise<Message> {
    const [msg] = await db.insert(messages).values({ conversationId, role, content }).returning();
    return msg;
  }

  async deleteConversation(id: number): Promise<void> {
    await db.delete(messages).where(eq(messages.conversationId, id));
    await db.delete(conversations).where(eq(conversations.id, id));
  }

  async getAllSessions(): Promise<SurfSession[]> {
    return db.select().from(surfSessions).orderBy(desc(surfSessions.sessionDate));
  }

  async getSession(id: string): Promise<SurfSession | undefined> {
    const [session] = await db.select().from(surfSessions).where(eq(surfSessions.id, id));
    return session;
  }

  async createSession(session: InsertSurfSession): Promise<SurfSession> {
    const [created] = await db.insert(surfSessions).values(session).returning();
    return created;
  }

  async deleteSession(id: string): Promise<void> {
    await db.delete(surfSessions).where(eq(surfSessions.id, id));
  }
}

export const storage = new DatabaseStorage();
