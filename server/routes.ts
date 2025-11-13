import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { scraper } from "./scraper";
import { scrapeRateLimiter } from "./rate-limiter";
import { scrapeConfigSchema } from "@shared/schema";
import { stringify } from "csv-stringify/sync";

export async function registerRoutes(app: Express): Promise<Server> {
  app.post("/api/scrape/start", async (req, res) => {
    try {
      const clientIp = req.ip || req.socket.remoteAddress || "unknown";
      
      if (!scrapeRateLimiter.isAllowed(clientIp)) {
        const remainingTime = Math.ceil(scrapeRateLimiter.getRemainingTime(clientIp) / 1000);
        return res.status(429).json({
          error: "Too many requests. Please try again later.",
          retryAfter: remainingTime,
        });
      }

      const { url } = req.body;

      if (!url) {
        return res.status(400).json({ error: "URL is required" });
      }

      if (!url.includes("smartframe.com")) {
        return res.status(400).json({ error: "URL must be from smartframe.com" });
      }

      const config = scrapeConfigSchema.parse({
        url,
        maxImages: req.body.maxImages !== undefined ? req.body.maxImages : 0,
        extractDetails: req.body.extractDetails !== false,
        sortBy: req.body.sortBy || "relevance",
        autoScroll: req.body.autoScroll !== false,
        scrollDelay: req.body.scrollDelay || 1000,
      });

      const job = await storage.createScrapeJob(url, config);

      scraper.scrape(job.id, url, config).catch((error) => {
        console.error("Scraping failed:", error);
      });

      res.json({ jobId: job.id, status: "started" });
    } catch (error) {
      console.error("Error starting scrape:", error);
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to start scraping",
      });
    }
  });

  app.get("/api/scrape/job/:jobId", async (req, res) => {
    try {
      const { jobId } = req.params;
      const job = await storage.getScrapeJob(jobId);

      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      res.json(job);
    } catch (error) {
      console.error("Error fetching job:", error);
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to fetch job",
      });
    }
  });

  app.get("/api/scrape/jobs", async (req, res) => {
    try {
      const jobs = await storage.getAllScrapeJobs();
      res.json(jobs);
    } catch (error) {
      console.error("Error fetching jobs:", error);
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to fetch jobs",
      });
    }
  });

  app.get("/api/export/:jobId", async (req, res) => {
    try {
      const { jobId } = req.params;
      const { format = "json" } = req.query;

      const job = await storage.getScrapeJob(jobId);

      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      if (!job.images || job.images.length === 0) {
        return res.status(400).json({ error: "No images to export" });
      }

      if (format === "csv") {
        const csvData = stringify(job.images, {
          header: true,
          columns: [
            { key: "smartframeId", header: "Image ID" },
            { key: "photographer", header: "Photographer" },
            { key: "imageSize", header: "Size" },
            { key: "fileSize", header: "File Size" },
            { key: "city", header: "City" },
            { key: "country", header: "Country" },
            { key: "date", header: "Date" },
            { key: "matchEvent", header: "Event" },
            { key: "url", header: "URL" },
            { key: "copyLink", header: "Copy Link" },
            { key: "thumbnailUrl", header: "Thumbnail URL" },
          ],
        });

        res.setHeader("Content-Type", "text/csv");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="smartframe-export-${jobId}.csv"`
        );
        res.send(csvData);
      } else {
        const jsonData = {
          jobId: job.id,
          url: job.url,
          totalImages: job.images.length,
          scrapedAt: job.startedAt,
          completedAt: job.completedAt,
          images: job.images,
        };

        res.setHeader("Content-Type", "application/json");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="smartframe-export-${jobId}.json"`
        );
        res.json(jsonData);
      }
    } catch (error) {
      console.error("Error exporting data:", error);
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to export data",
      });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
