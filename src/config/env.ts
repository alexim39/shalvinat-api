import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  API_PREFIX: z.string().default("/api"),
  CLIENT_ORIGIN: z.string().default("http://localhost:4200"),
  MONGO_URI: z
    .string()
    .default(
      "mongodb://shalvinat:shalvinat_dev_password@localhost:27017/shalvinat_hms?authSource=admin",
    ),
  JWT_ACCESS_SECRET: z.string().default("dev-access-secret-change-before-production"),
  JWT_REFRESH_SECRET: z.string().default("dev-refresh-secret-change-before-production"),
  FIELD_ENCRYPTION_KEY: z.string().default("dev-field-encryption-key-change-before-production"),
  ACCESS_TOKEN_TTL: z.string().default("15m"),
  REFRESH_TOKEN_TTL: z.string().default("8h"),
  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),
});

export const env = envSchema.parse(process.env);

if (
  env.NODE_ENV === "production" &&
  (env.JWT_ACCESS_SECRET.startsWith("dev-") ||
    env.JWT_REFRESH_SECRET.startsWith("dev-") ||
    env.FIELD_ENCRYPTION_KEY.startsWith("dev-"))
) {
  throw new Error("Production secrets must be configured with strong non-default values.");
}
