import crypto from "node:crypto";
import { env } from "../config/env.js";

const key = crypto.createHash("sha256").update(env.FIELD_ENCRYPTION_KEY).digest();

export type EncryptedText = {
  iv: string;
  tag: string;
  value: string;
};

export function encryptText(plainText?: string | null): EncryptedText | undefined {
  if (!plainText) {
    return undefined;
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);

  return {
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    value: encrypted.toString("base64"),
  };
}

export function decryptText(payload?: EncryptedText | null): string | undefined {
  if (!payload?.iv || !payload?.tag || !payload?.value) {
    return undefined;
  }

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(payload.iv, "base64"));
  decipher.setAuthTag(Buffer.from(payload.tag, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payload.value, "base64")),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}
