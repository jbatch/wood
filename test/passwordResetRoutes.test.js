import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function startServer(t) {
  const port = await freePort();
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "wood-reset-"));
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["src/server.js"], {
    cwd: path.resolve(import.meta.dirname, ".."),
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(port),
      WOOD_BASE_URL: baseUrl,
      WOOD_DB_FILE: path.join(dir, "wood.sqlite"),
      WOOD_DATA_FILE: path.join(dir, "wood.json"),
      WOOD_SESSION_SECRET: "test-password-reset-secret",
      WOOD_UI: "v2",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  t.after(async () => {
    child.kill();
    await fs.rm(dir, { recursive: true, force: true });
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

  return baseUrl;
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
