import { Redis } from "@upstash/redis";

// Single shared Redis client for all API routes.
export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});
