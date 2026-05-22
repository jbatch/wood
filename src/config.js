import path from "node:path";
import fs from "node:fs";

loadDotEnv(path.join(process.cwd(), ".env"));

export const config = {
  port: Number(process.env.PORT || 3000),
  host: process.env.HOST || "0.0.0.0",
  baseUrl:
    process.env.WOOD_BASE_URL ||
    `http://${process.env.HOST || "localhost"}:${process.env.PORT || 3000}`,
  dataFile:
    process.env.WOOD_DATA_FILE ||
    path.join(process.cwd(), "data", "wood.json"),
  dbFile:
    process.env.WOOD_DB_FILE ||
    path.join(process.cwd(), "data", "wood.sqlite"),
  tlsKeyFile: process.env.WOOD_TLS_KEY_FILE || "",
  tlsCertFile: process.env.WOOD_TLS_CERT_FILE || "",
  sessionSecret:
    process.env.WOOD_SESSION_SECRET ||
    "dev-only-change-wood-session-secret",
  vapidPublicKey: process.env.WOOD_VAPID_PUBLIC_KEY || "",
  vapidPrivateKey: process.env.WOOD_VAPID_PRIVATE_KEY || "",
  vapidSubject:
    process.env.WOOD_VAPID_SUBJECT || "mailto:admin@example.com",
  ui: process.env.WOOD_UI || "v1",
};

function loadDotEnv(file) {
  if (!fs.existsSync(file)) return;

  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const equals = trimmed.indexOf("=");
    if (equals === -1) continue;

    const key = trimmed.slice(0, equals).trim();
    let value = trimmed.slice(equals + 1).trim();
    if (!key || process.env[key] !== undefined) continue;

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}
