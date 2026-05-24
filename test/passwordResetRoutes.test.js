import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { hashPassword } from "../src/auth.js";
import { createStore } from "../src/store.js";

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function startServerInstance(options = {}) {
  const port = await freePort();
  const dir = options.dir || await fs.mkdtemp(path.join(os.tmpdir(), "wood-reset-"));
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["src/server.js"], {
    cwd: path.resolve(import.meta.dirname, ".."),
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(port),
      WOOD_BASE_URL: baseUrl,
      WOOD_DB_FILE: options.dbFile || path.join(dir, "wood.sqlite"),
      WOOD_DATA_FILE: options.dataFile || path.join(dir, "wood.json"),
      WOOD_SESSION_SECRET: "test-password-reset-secret",
      WOOD_UI: "v2",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("server_start_timeout")), 5000);
    child.once("exit", (code) => reject(new Error(`server_exited_${code}`)));
    child.stdout.on("data", (chunk) => {
      if (String(chunk).includes("Wood listening")) {
        clearTimeout(timer);
        resolve();
      }
    });
  });

  return {
    baseUrl,
    child,
    dir,
    stop: () => stopServer(child),
  };
}

async function startServer(t) {
  const instance = await startServerInstance();
  t.after(async () => {
    await instance.stop();
    await fs.rm(instance.dir, { recursive: true, force: true });
  });
  return instance.baseUrl;
}

async function stopServer(child) {
  if (child.exitCode !== null || child.signalCode) return;
  child.kill();
  await new Promise((resolve) => child.once("close", resolve));
}

async function seedBackfillDb(dbFile) {
  const store = await createStore(dbFile);
  await store.write(async (db) => {
    db.invites = [];
    db.friendships = [];
    db.groups = [];
    db.group_members = [];
    db.group_woods = [];
    db.mutes = [];
    db.password_resets = [];
    db.push_subs = [];
    db.streaks = [];
    db.woods = [];
    db.achievements_earned = [];
    db.notifications = [];
    db.users = [
      {
        id: "alice",
        username: "alice.backfill",
        email: "alice.backfill@example.com",
        password_hash: await hashPassword("alice-password"),
        role: "user",
        suspended: false,
        favourite_wood: "",
        birthday_month: null,
        birthday_day: null,
        birthday_visible: false,
        notification_snoozed_until: null,
        pwa_installed_at: null,
        pwa_last_seen_at: null,
        pwa_display_mode: null,
        created_at: "2026-05-20T00:00:00.000Z",
        last_active_at: null,
        deleted_at: null,
      },
      {
        id: "bob",
        username: "bob.backfill",
        email: "bob.backfill@example.com",
        password_hash: await hashPassword("bob-password"),
        role: "user",
        suspended: false,
        favourite_wood: "",
        birthday_month: null,
        birthday_day: null,
        birthday_visible: false,
        notification_snoozed_until: null,
        pwa_installed_at: null,
        pwa_last_seen_at: null,
        pwa_display_mode: null,
        created_at: "2026-05-20T00:00:00.000Z",
        last_active_at: null,
        deleted_at: null,
      },
    ];
    db.woods.push({
      id: "wood_backfill",
      sender_id: "alice",
      recipient_id: "bob",
      sent_at: new Date().toISOString(),
      type: "normal",
      label: "Wood",
      hold_duration_ms: 0,
      streak_count_after: null,
      streak_incremented: false,
    });
    delete db.config.notification_backfilled_at;
  });
  store.sqlite.close();
}

async function loginAndReadNotifications(baseUrl) {
  const request = client(baseUrl);
  let response = await request("/api/login", {
    method: "POST",
    body: { username: "bob.backfill", password: "bob-password" },
  });
  assert.equal(response.res.status, 200);
  response = await request("/api/notifications");
  assert.equal(response.res.status, 200);
  return response.data;
}

function client(baseUrl) {
  let cookie = "";
  return async function request(pathname, options = {}) {
    const res = await fetch(`${baseUrl}${pathname}`, {
      method: options.method || "GET",
      headers: {
        ...(options.body ? { "content-type": "application/json" } : {}),
        ...(cookie ? { cookie } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) cookie = setCookie.split(";")[0];
    const data = res.status === 204 ? null : await res.json();
    return { res, data };
  };
}

test("admin generated password reset links are one-time login links", async (t) => {
  const baseUrl = await startServer(t);
  const admin = client(baseUrl);
  const user = client(baseUrl);

  let response = await admin("/api/login", {
    method: "POST",
    body: { username: "admin", password: "wood-admin" },
  });
  assert.equal(response.res.status, 200);

  response = await admin("/api/admin/invites", {
    method: "POST",
    body: { count: 1, days: 1 },
  });
  const inviteCode = new URL(response.data.invites[0].url).searchParams.get("invite");

  response = await user("/api/signup", {
    method: "POST",
    body: {
      inviteCode,
      username: "reset.friend",
      email: "reset@example.com",
      password: "old-wood-password",
    },
  });
  assert.equal(response.res.status, 201);
  const userId = response.data.user.id;

  response = await admin(`/api/admin/users/${userId}/password-reset`, { method: "POST" });
  assert.equal(response.res.status, 200);
  const token = new URL(response.data.link).searchParams.get("token");
  assert.ok(token);

  response = await user("/api/password-resets/complete", {
    method: "POST",
    body: { token, password: "new-wood-password" },
  });
  assert.equal(response.res.status, 200);
  assert.equal(response.data.user.username, "reset.friend");

  response = await client(baseUrl)("/api/login", {
    method: "POST",
    body: { username: "reset.friend", password: "old-wood-password" },
  });
  assert.equal(response.res.status, 401);

  response = await client(baseUrl)("/api/login", {
    method: "POST",
    body: { username: "reset.friend", password: "new-wood-password" },
  });
  assert.equal(response.res.status, 200);

  response = await client(baseUrl)("/api/password-resets/complete", {
    method: "POST",
    body: { token, password: "another-password" },
  });
  assert.equal(response.res.status, 404);
});

test("users can change their own password from settings", async (t) => {
  const baseUrl = await startServer(t);
  const admin = client(baseUrl);
  const user = client(baseUrl);

  let response = await admin("/api/login", {
    method: "POST",
    body: { username: "admin", password: "wood-admin" },
  });
  assert.equal(response.res.status, 200);

  response = await admin("/api/admin/invites", {
    method: "POST",
    body: { count: 1, days: 1 },
  });
  const inviteCode = new URL(response.data.invites[0].url).searchParams.get("invite");

  response = await user("/api/signup", {
    method: "POST",
    body: {
      inviteCode,
      username: "settings.friend",
      email: "settings@example.com",
      password: "old-wood-password",
    },
  });
  assert.equal(response.res.status, 201);

  response = await user("/api/password", {
    method: "POST",
    body: {
      currentPassword: "wrong-password",
      newPassword: "ignored-password",
    },
  });
  assert.equal(response.res.status, 401);

  response = await user("/api/password", {
    method: "POST",
    body: {
      currentPassword: "old-wood-password",
      newPassword: "short",
    },
  });
  assert.equal(response.res.status, 400);

  response = await user("/api/password", {
    method: "POST",
    body: {
      currentPassword: "old-wood-password",
      newPassword: "new-wood-password",
    },
  });
  assert.equal(response.res.status, 200);

  response = await client(baseUrl)("/api/login", {
    method: "POST",
    body: { username: "settings.friend", password: "old-wood-password" },
  });
  assert.equal(response.res.status, 401);

  response = await client(baseUrl)("/api/login", {
    method: "POST",
    body: { username: "settings.friend", password: "new-wood-password" },
  });
  assert.equal(response.res.status, 200);
});

test("notifications persist after read and cap recent history", async (t) => {
  const baseUrl = await startServer(t);
  const admin = client(baseUrl);
  const alice = client(baseUrl);
  const bob = client(baseUrl);

  let response = await admin("/api/login", {
    method: "POST",
    body: { username: "admin", password: "wood-admin" },
  });
  assert.equal(response.res.status, 200);

  response = await admin("/api/admin/invites", {
    method: "POST",
    body: { count: 2, days: 1 },
  });
  const [aliceInvite, bobInvite] = response.data.invites.map((invite) =>
    new URL(invite.url).searchParams.get("invite")
  );

  response = await alice("/api/signup", {
    method: "POST",
    body: {
      inviteCode: aliceInvite,
      username: "alice.wood",
      email: "alice@example.com",
      password: "alice-password",
    },
  });
  assert.equal(response.res.status, 201);
  const aliceId = response.data.user.id;

  response = await bob("/api/signup", {
    method: "POST",
    body: {
      inviteCode: bobInvite,
      username: "bob.wood",
      email: "bob@example.com",
      password: "bob-password",
    },
  });
  assert.equal(response.res.status, 201);

  response = await bob("/api/friend-requests", {
    method: "POST",
    body: { username: "alice.wood" },
  });
  assert.equal(response.res.status, 201);

  response = await alice("/api/app");
  assert.equal(response.data.notifications.unread_count, 1);
  const friendshipId = response.data.incomingRequests[0].id;

  response = await alice("/api/notifications/read-all", { method: "POST" });
  assert.equal(response.data.unread_count, 0);
  assert.equal(response.data.notifications.length, 1);
  assert.equal(response.data.notifications[0].type, "friend.request");
  assert.ok(response.data.notifications[0].read_at);

  response = await alice(`/api/friend-requests/${friendshipId}/accept`, { method: "POST" });
  assert.equal(response.res.status, 200);

  for (let index = 0; index < 101; index += 1) {
    response = await bob(`/api/friends/${aliceId}/wood`, { method: "POST" });
    assert.equal(response.res.status, 201);
    response = await alice(`/api/friends/${response.data.user.id}/wood`, { method: "POST" });
    assert.equal(response.res.status, 201);
  }

  response = await alice("/api/notifications");
  assert.equal(response.data.notifications.length, 100);
  assert.equal(response.data.unread_count, 100);
  assert.ok(response.data.notifications.some((notification) => notification.type === "wood.dm"));
});

test("notification backfill is a no-op after restart", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "wood-backfill-"));
  const dbFile = path.join(dir, "wood.sqlite");
  const dataFile = path.join(dir, "wood.json");
  t.after(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  await seedBackfillDb(dbFile);

  let server = await startServerInstance({ dir, dbFile, dataFile });
  let data = await loginAndReadNotifications(server.baseUrl);
  assert.equal(data.notifications.length, 1);
  assert.equal(data.notifications[0].type, "wood.dm");
  assert.equal(data.unread_count, 0);
  await server.stop();

  server = await startServerInstance({ dir, dbFile, dataFile });
  t.after(async () => {
    await server.stop();
  });
  data = await loginAndReadNotifications(server.baseUrl);
  assert.equal(data.notifications.length, 1);
  assert.equal(data.notifications[0].type, "wood.dm");
  assert.equal(data.unread_count, 0);
});
