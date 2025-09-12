import request from "supertest";
import app from "../server.js";
import { createClient, RedisClientType } from "redis";
import type { Project, Short } from "../../src/types/youtube-shorts-content-factory/types.js";
import { ShortStatus } from "../../src/types/youtube-shorts-content-factory/types.js";


let redisClient: RedisClientType;
let testProject: Project;
let testShort: Short;

beforeAll(async () => {
  redisClient = createClient({
    url: `redis://${process.env.REDIS_HOST || "redis"}:${process.env.REDIS_PORT || "6379"}`,
    socket: { family: 4 } // Explicitly use IPv4
  });
  await redisClient.connect();

  testProject = {
    id: "proj-1",
    name: "Test Project",
    description: "Test Description",
    shorts: [],
  };

  testShort = {
    id: "short-1",
    projectId: "proj-1",
    title: "Test Short Title",
    description: "Test Short Description",
    status: ShortStatus.IDEA, // Use enum value
    script: {
      idea: "Test Idea",
      draft: "Test Draft",
      hook: "Test Hook",
      immersion: "Test Immersion",
      body: "Test Body",
      cta: "Test CTA",
    },
    metadata: {
      tags: "tag1, tag2",
      cta: "CTA Text",
      imageIdeas: "Image Idea",
      audioNotes: "Audio Note",
    },
    images: [
      "/uploads/images/placeholder.png",
      "/uploads/images/placeholder.png",
      "/uploads/images/placeholder.png",
      "/uploads/images/placeholder.png",
    ],
    titleLine1: "Title Line 1",
    titleLine2: "Title Line 2",
    youtubeUrl: "https://www.youtube.com/watch?v=test",
  };

  testProject.shorts.push(testShort);

  // Store the project in Redis
  await redisClient.hSet(`project:${testProject.id}`, "id", testProject.id);
  await redisClient.hSet(`project:${testProject.id}`, "name", testProject.name);
  await redisClient.hSet(`project:${testProject.id}`, "description", testProject.description);
  await redisClient.hSet(`project:${testProject.id}`, "shorts", JSON.stringify(testProject.shorts));
});

afterAll(async () => {
  await redisClient.del(`project:${testProject.id}`); // Clean up test data
  await redisClient.quit();
});

describe("Report API", () => {
  it("should return a report for a short", async () => {
    const response = await request(app)
      .get(`/api/projects/${testProject.id}/shorts/${testShort.id}/report`)
      .expect(200);

    expect(response.body).toHaveProperty("title", testShort.title);
    expect(response.body).toHaveProperty("description", testShort.description);
    expect(response.body.breakdown).toHaveProperty("hook.description", testShort.script.hook);
    expect(response.body.performance).toHaveProperty("views"); // Check for presence of performance data
  });
});