import crypto from "node:crypto";
import { config } from "./config.js";

const SESSION_COOKIE = "wood_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 180;

export { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS };

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("base64url");
  const key = await scrypt(password, salt);
  return `scrypt$${salt}$${key.toString("base64url")}`;
}

export async function verifyPassword(password, hash) {
  const [scheme, salt, encoded] = String(hash || "").split("$");
  if (scheme !== "scrypt" || !salt || !encoded) return false;
  const expected = Buffer.from(encoded, "base64url");
  const actual = await scrypt(password, salt);
  return (
    expected.length === actual.length &&
    crypto.timingSafeEqual(expected, actual)
  );
}

function scrypt(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}

export function signSession(userId) {
  const expiresAt = Date.now() + SESSION_MAX_AGE_SECONDS * 1000;
  const payload = Buffer.from(JSON.stringify({ userId, expiresAt })).toString(
    "base64url",
  );
  const signature = crypto
    .createHmac("sha256", config.sessionSecret)
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}

export function verifySession(token) {
  const [payload, signature] = String(token || "").split(".");
  if (!payload || !signature) return null;
  const expected = crypto
    .createHmac("sha256", config.sessionSecret)
    .update(payload)
    .digest("base64url");
  const actual = Buffer.from(signature);
  const exp = Buffer.from(expected);
  if (actual.length !== exp.length || !crypto.timingSafeEqual(actual, exp)) {
    return null;
  }

  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!data.userId || Date.now() > data.expiresAt) return null;
    return data;
  } catch {
    return null;
  }
}
