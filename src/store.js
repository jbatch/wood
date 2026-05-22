import fs from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";
import { hashPassword } from "./auth.js";
import { id, inviteCode } from "./ids.js";
import { addDaysIso, nowIso } from "./time.js";

const initialConfig = {
  cooldown_hours: 24,
  seasonal_enabled: true,
  seasonal_themes: [
    {
      id: "christmas",
      date: "12-25",
      label: "Christmas Wood",
      notification: "🎄 {sender} sent you a Christmas Wood",
    },
    {
      id: "halloween",
      date: "10-31",
      label: "Spooky Wood",
      notification: "🎃 {sender} sent you a Spooky Wood",
    },
    {
      id: "new-year",
      date: "01-01",
      label: "New Year Wood",
      notification: "🎆 {sender} sent you a New Year Wood",
    },
  ],
};

export async function createStore(file = config.dataFile) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  let db;
  try {
    db = JSON.parse(await fs.readFile(file, "utf8"));
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
    db = emptyDb();
  }

  db.config = { ...initialConfig, ...(db.config || {}) };
  await seedFirstAdmin(db);
  await persist(file, db);

  return {
    db,
    file,
    async write(mutator) {
      const result = await mutator(db);
      await persist(file, db);
      return result;
    },
  };
}

function emptyDb() {
  return {
    users: [],
    push_subs: [],
    invites: [],
    friendships: [],
    woods: [],
    mutes: [],
    config: initialConfig,
  };
}

async function seedFirstAdmin(db) {
  if (db.users.length) return;
  db.users.push({
    id: id("user"),
    username: "admin",
    email: "admin@example.com",
    password_hash: await hashPassword("wood-admin"),
    role: "admin",
    suspended: false,
    created_at: nowIso(),
    last_active_at: null,
  });
  db.invites.push({
    id: id("invite"),
    code: inviteCode(),
    created_by: db.users[0].id,
    expires_at: addDaysIso(7),
    used_by: null,
    used_at: null,
    revoked_at: null,
    created_at: nowIso(),
  });
}

async function persist(file, db) {
  const tempFile = `${file}.tmp`;
  await fs.writeFile(tempFile, `${JSON.stringify(db, null, 2)}\n`);
  await fs.rename(tempFile, file);
}
