import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().min(1),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    CORS_ORIGIN: z.url(),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    OPENAI_API_KEY: z.string().min(1),
    PINECONE_API_KEY: z.string().min(1),
    PINECONE_INDEX: z.string().min(1),
    GOOGLE_CLIENT_ID: z.string().min(1),
    GOOGLE_CLIENT_SECRET: z.string().min(1),
    GOOGLE_DRIVE_REDIRECT_URI: z.url(),
    DRIVE_TOKEN_ENCRYPTION_KEY: z.string().min(32),
    DRIVE_SYNC_WEBHOOK_ENABLED: z
      .string()
      .transform((value) => value.toLowerCase() === "true")
      .optional(),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
