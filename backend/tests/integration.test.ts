import request from "supertest";
import app from "../server.js";
import { Project, Short, YouTubeVideoDetails, ShortStatus } from "../../src/types/youtube-shorts-content-factory/types.js";
import { jest } from '@jest/globals';
import fs from "fs";
import path from "path";

// Mock the entire redis module
jest.mock("redis", () => {
  const mockRedisClient: any = {
    connect: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    quit: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    set: jest.fn<(key: string, value: string) => Promise<void>>().mockResolvedValue(undefined),
    get: jest.fn<(key: string) => Promise<string | null>>().mockResolvedValue(null),
    del: jest.fn<(key: string) => Promise<number>>().mockResolvedValue(1),
    lPush: jest.fn<(key: string, value: string) => Promise<number>>().mockResolvedValue(1),
  };
  return {
    createClient: jest.fn(() => mockRedisClient),
  };
});

// Re-import createClient to get the mocked version
import { createClient, RedisClientType } from "redis";

// Mock youtubeService
jest.mock("../../src/services/youtubeService", () => ({
  fetchVideoDetails: jest.fn((url: string): Promise<YouTubeVideoDetails> => {
    console.log(`Mocking fetchVideoDetails for URL: ${url}`);
    return Promise.resolve({
      id: "mock-video-id",
      title: "Mock Video Title",
      description: "This is a mocked YouTube video description.",
      thumbnailUrl: "http://mock-thumb.jpg",
      channelTitle: "Mock Channel",
      publishedAt: "2023-01-01T00:00:00Z",
      viewCount: "100000",
      likeCount: "5000",
      commentCount: "100",
      duration: "PT5M30S", // 5 minutes 30 seconds
      tags: ["mock", "test", "youtube"],
    });
  }),
}));

// Mock fs.unlink to prevent actual file deletion during test
jest.spyOn(fs, 'unlink').mockImplementation((path, callback) => {
  console.log(`Mocking fs.unlink: preventing deletion of ${path}`);
  if (callback) callback(null);
});

let redisClient: any;
let testProject: Project;
let testShort: Short;

import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FIXTURES_DIR = path.join(__dirname, "fixtures");
const DUMMY_AUDIO_PATH = path.join(FIXTURES_DIR, "test-audio.mp3");
const DUMMY_IMAGE_PATH = path.join(FIXTURES_DIR, "test-image.png");
const DUMMY_PDF_PATH = path.join(__dirname, "../../services/puppeteer_worker/data", "mock-generated-report.pdf");

beforeAll(async () => {
  // Initialize Redis client
  redisClient = createClient({
    url: `redis://${process.env.REDIS_HOST || "redis"}:${process.env.REDIS_PORT || "6379"}`,
    socket: { family: 4 }, // Explicitly use IPv4
  }) as any;
  await redisClient.connect();

  // Ensure fixtures directory exists
  if (!fs.existsSync(FIXTURES_DIR)) {
    fs.mkdirSync(FIXTURES_DIR, { recursive: true });
  }

  // Create dummy audio and image files
  fs.writeFileSync(DUMMY_AUDIO_PATH, "dummy audio content");
  fs.writeFileSync(DUMMY_IMAGE_PATH, "dummy image content");

  // Create a dummy PDF file for Puppeteer mock response
  const puppeteerDataDir = path.dirname(DUMMY_PDF_PATH);
  if (!fs.existsSync(puppeteerDataDir)) {
    fs.mkdirSync(puppeteerDataDir, { recursive: true });
  }
  fs.writeFileSync(DUMMY_PDF_PATH, "dummy PDF content");

  // Mock Redis for Puppeteer interaction
  (redisClient.lPush as jest.Mock).mockImplementation(async (key: string, value: string) => {
    console.log(`Mocking redisClient.lPush: key=${key}, value=${value}`);
    // Simulate Puppeteer worker processing and saving a result
    if (key === 'puppeteer_tasks_list') {
      const task = JSON.parse(value);
      if (task.type === 'generate_pdf_from_html') {
        const taskId = task.payload.task_id;
        const responseKey = `puppeteer_response:${taskId}`;
        // Use the actual redis client to set the mock response
        await redisClient.set(responseKey, JSON.stringify({ status: 'success', filePath: DUMMY_PDF_PATH }));
      }
    }
    return 1; // Return a mock length
  });

  (redisClient.get as jest.Mock).mockImplementation(async (key: string) => {
    console.log(`Mocking redisClient.get: key=${key}`);
    if (key.startsWith('puppeteer_response:')) {
      // Return the mock response set by lPush mock
      return await redisClient.get(key);
    }
    return null;
  });

  (redisClient.del as jest.Mock).mockImplementation(async (key: string) => {
    console.log(`Mocking redisClient.del: key=${key}`);
    return 1; // Return a mock count
  });
});

afterAll(async () => {
  // Clean up dummy files and directory
  if (fs.existsSync(DUMMY_AUDIO_PATH)) fs.unlinkSync(DUMMY_AUDIO_PATH);
  if (fs.existsSync(DUMMY_IMAGE_PATH)) fs.unlinkSync(DUMMY_IMAGE_PATH);
  if (fs.existsSync(FIXTURES_DIR)) fs.rmdirSync(FIXTURES_DIR);
  if (fs.existsSync(DUMMY_PDF_PATH)) fs.unlinkSync(DUMMY_PDF_PATH);

  // Disconnect Redis client
  await redisClient.quit();

  // Restore mocks
  jest.restoreAllMocks();
});

describe("End-to-End Short Generation and Report", () => {
  it("should successfully create a short, simulate generation, and generate a PDF report", async () => {
    // 1. Create a Project
    const projectResponse = await request(app)
      .post("/api/projects")
      .send({ name: "E2E Test Project", description: "Project for end-to-end testing" })
      .expect(201);
    testProject = projectResponse.body;
    expect(testProject).toHaveProperty("id");
    expect(testProject.name).toBe("E2E Test Project");

    // 2. Simulate File Upload (Image)
    // We need to mock the actual file upload endpoint as well, as it's part of the flow
    // For this test, we'll simulate the response of the upload,
    // assuming the frontend would have sent a real file.
    const uploadedImageUrl = `/uploads/images/uploaded-test-image-${Date.now()}.png`;
    jest.spyOn(app, 'post').mockImplementationOnce((path, ...handlers) => {
      if (path === '/api/upload/multiple-images') {
        const mockHandler = (_req: any, res: any) => {
          res.json([uploadedImageUrl]);
        };
        return app.post(path, mockHandler);
      }
      return app.post(path, ...handlers);
    });

    // 3. Create a Short (simulating frontend AI Shorts Generator output)
    testShort = {
      id: `short-${Date.now()}`,
      projectId: testProject.id,
      title: "E2E Test Short",
      description: "Short generated for E2E test",
      status: ShortStatus.DRAFT_GENERATED, // Simulating a generated short
      script: {
        idea: "An idea for a short",
        draft: "Draft script content",
        hook: "This is the hook!",
        immersion: "This is the immersion part.",
        body: "This is the main body of the short.",
        cta: "Call to action here!",
      },
      metadata: {
        tags: "e2e, test, short",
        cta: "Visit our channel!",
        imageIdeas: "Visuals for the short",
        audioNotes: "Background music, sound effects",
      },
      images: [uploadedImageUrl], // Use the simulated uploaded image URL
      titleLine1: "Awesome",
      titleLine2: "Short",
      youtubeUrl: "https://www.youtube.com/watch?v=mock-video-id",
      youtubeViewCount: "100000",
      youtubeLikeCount: "5000",
      youtubeCommentCount: "100",
      youtubeDuration: "PT5M30S",
    };

    const shortResponse = await request(app)
      .post(`/api/projects/${testProject.id}/shorts`)
      .send(testShort)
      .expect(201);
    expect(shortResponse.body).toHaveProperty("id");
    expect(shortResponse.body.title).toBe("E2E Test Short");

    // 4. Request PDF Report
    const pdfReportResponse = await request(app)
      .get(`/api/projects/${testProject.id}/shorts/${testShort.id}/report/pdf`)
      .expect(200);

    expect(pdfReportResponse.headers["content-type"]).toBe("application/pdf");
    expect(pdfReportResponse.headers["content-disposition"]).toContain("attachment; filename=");
    expect(pdfReportResponse.headers["content-disposition"]).toContain("_report.pdf");

    // Verify that the Puppeteer task was pushed to Redis
    expect(redisClient.lPush).toHaveBeenCalledWith(
      'puppeteer_tasks_list',
      expect.stringContaining('"type":"generate_pdf_from_html"')
    );

    // Verify that the PDF file content was returned (mocked)
    // In a real scenario, you might check the actual buffer content if you have a known dummy PDF
    // For now, we rely on the mock and header checks.
    expect(pdfReportResponse.body.toString()).toBe("dummy PDF content");

    // 5. Verify Video File Creation (Conceptual)
    // As discussed, the video file is created by the frontend.
    // Here, we verify that the short data contains all necessary elements for video generation.
    const fetchedShortResponse = await request(app)
      .get(`/api/projects/${testProject.id}/shorts/${testShort.id}`)
      .expect(200);
    const fetchedShort = fetchedShortResponse.body;

    expect(fetchedShort.script).toEqual(testShort.script);
    expect(fetchedShort.images).toEqual(testShort.images);
    expect(fetchedShort.youtubeUrl).toBe(testShort.youtubeUrl);
    expect(fetchedShort.titleLine1).toBe(testShort.titleLine1);
    expect(fetchedShort.titleLine2).toBe(testShort.titleLine2);
  });
});
