import { ScrapeJob } from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  createScrapeJob(url: string, config: any): Promise<ScrapeJob>;
  getScrapeJob(id: string): Promise<ScrapeJob | undefined>;
  updateScrapeJob(id: string, updates: Partial<ScrapeJob>): Promise<ScrapeJob | undefined>;
  getAllScrapeJobs(): Promise<ScrapeJob[]>;
}

export class MemStorage implements IStorage {
  private scrapeJobs: Map<string, ScrapeJob>;

  constructor() {
    this.scrapeJobs = new Map();
  }

  async createScrapeJob(url: string, config: any): Promise<ScrapeJob> {
    const id = randomUUID();
    const job: ScrapeJob = {
      id,
      url,
      status: "pending",
      progress: 0,
      totalImages: 0,
      scrapedImages: 0,
      images: [],
      error: null,
      startedAt: new Date().toISOString(),
      completedAt: null,
      config,
    };
    this.scrapeJobs.set(id, job);
    return job;
  }

  async getScrapeJob(id: string): Promise<ScrapeJob | undefined> {
    return this.scrapeJobs.get(id);
  }

  async updateScrapeJob(id: string, updates: Partial<ScrapeJob>): Promise<ScrapeJob | undefined> {
    const job = this.scrapeJobs.get(id);
    if (!job) return undefined;

    const updatedJob = { ...job, ...updates };
    this.scrapeJobs.set(id, updatedJob);
    return updatedJob;
  }

  async getAllScrapeJobs(): Promise<ScrapeJob[]> {
    return Array.from(this.scrapeJobs.values());
  }
}

export const storage = new MemStorage();
