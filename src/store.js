import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import Database from "better-sqlite3";
import { config } from "./config.js";
import { hashPassword } from "./auth.js";
import { ensureAchievementDefinitions, normalizeAchievementDef } from "./achievements.js";
import { id, inviteCode } from "./ids.js";
import { addDaysIso, nowIso } from "./time.js";
import { rebuildStreaksFromWoods } from "./woodRules.js";

const STREAK_MODEL = "mutual-local-day-v1";

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

export async function createStore(file = config.dbFile) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  migrate(sqlite);
  importLegacyJsonIfNeeded(sqlite);

  const store = {
    db: loadSnapshot(sqlite),
    file,
    sqlite,
    async write(mutator) {
      const result = await mutator(store.db);
      persistSnapshot(sqlite, store.db);
      store.db = loadSnapshot(sqlite);
      return result;
    },
  };

  await seedFirstAdmin(store);
  if (store.db.woods.length && store.db.config.streak_model !== STREAK_MODEL) {
    await store.write((db) => {
      rebuildStreaksFromWoods(db);
      db.config.streak_model = STREAK_MODEL;
    });
  } else if (!store.db.config.streak_model) {
    await store.write((db) => {
      db.config.streak_model = STREAK_MODEL;
    });
  }
  await store.write((db) => ensureAchievementDefinitions(db));
  store.db = loadSnapshot(sqlite);
  return store;
}

function migrate(sqlite) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      suspended INTEGER NOT NULL DEFAULT 0,
      favourite_wood TEXT,
      birthday_month INTEGER,
      birthday_day INTEGER,
      birthday_visible INTEGER NOT NULL DEFAULT 0,
      notification_snoozed_until TEXT,
      pwa_installed_at TEXT,
      pwa_last_seen_at TEXT,
      pwa_display_mode TEXT,
      created_at TEXT NOT NULL,
      last_active_at TEXT,
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS push_subs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      endpoint TEXT NOT NULL UNIQUE,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS invites (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      created_by TEXT,
      expires_at TEXT NOT NULL,
      used_by TEXT,
      used_at TEXT,
      reusable INTEGER NOT NULL DEFAULT 0,
      revoked_at TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (used_by) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS password_resets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      url TEXT,
      actor_id TEXT,
      data_json TEXT,
      dedupe_key TEXT UNIQUE,
      read_at TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS friendships (
      id TEXT PRIMARY KEY,
      requester_id TEXT NOT NULL,
      addressee_id TEXT NOT NULL,
      status TEXT NOT NULL,
      blocked_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT,
      FOREIGN KEY (requester_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (addressee_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (blocked_by) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS woods (
      id TEXT PRIMARY KEY,
      sender_id TEXT NOT NULL,
      recipient_id TEXT NOT NULL,
      sent_at TEXT NOT NULL,
      type TEXT NOT NULL,
      label TEXT NOT NULL,
      hold_duration_ms INTEGER NOT NULL DEFAULT 0,
      streak_count_after INTEGER,
      streak_incremented INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS mutes (
      id TEXT PRIMARY KEY,
      muter_id TEXT NOT NULL,
      muted_id TEXT NOT NULL,
      UNIQUE (muter_id, muted_id),
      FOREIGN KEY (muter_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (muted_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      dissolved_at TEXT,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS group_members (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      invited_by TEXT,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT,
      UNIQUE (group_id, user_id),
      FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS group_woods (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL,
      sender_id TEXT NOT NULL,
      sent_at TEXT NOT NULL,
      type TEXT NOT NULL,
      label TEXT NOT NULL,
      hold_duration_ms INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
      FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS streaks (
      id TEXT PRIMARY KEY,
      user_a_id TEXT NOT NULL,
      user_b_id TEXT NOT NULL,
      current_streak INTEGER NOT NULL DEFAULT 0,
      longest_streak INTEGER NOT NULL DEFAULT 0,
      last_exchange_at TEXT,
      at_risk INTEGER NOT NULL DEFAULT 0,
      milestones_sent TEXT NOT NULL DEFAULT '[]',
      updated_at TEXT NOT NULL,
      UNIQUE (user_a_id, user_b_id),
      FOREIGN KEY (user_a_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (user_b_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS achievements_def (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      icon TEXT NOT NULL,
      secret INTEGER NOT NULL DEFAULT 0,
      criteria_type TEXT NOT NULL,
      criteria_value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS achievements_earned (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      achievement_id TEXT NOT NULL,
      earned_at TEXT NOT NULL,
      UNIQUE (user_id, achievement_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (achievement_id) REFERENCES achievements_def(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS achievement_events (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      subject_id TEXT,
      meta_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS app_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      config_json TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_woods_pair_sent_at
      ON woods(sender_id, recipient_id, sent_at);
    CREATE INDEX IF NOT EXISTS idx_friendships_users
      ON friendships(requester_id, addressee_id, status);
    CREATE INDEX IF NOT EXISTS idx_group_woods_sent_at
      ON group_woods(group_id, sender_id, sent_at);
    CREATE INDEX IF NOT EXISTS idx_notifications_user_created
      ON notifications(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_achievement_events_user_type_created
      ON achievement_events(user_id, type, created_at);
  `);

  ensureColumn(sqlite, "users", "deleted_at", "TEXT");
  ensureColumn(sqlite, "users", "favourite_wood", "TEXT");
  ensureColumn(sqlite, "users", "birthday_month", "INTEGER");
  ensureColumn(sqlite, "users", "birthday_day", "INTEGER");
  ensureColumn(sqlite, "users", "birthday_visible", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(sqlite, "users", "notification_snoozed_until", "TEXT");
  ensureColumn(sqlite, "users", "pwa_installed_at", "TEXT");
  ensureColumn(sqlite, "users", "pwa_last_seen_at", "TEXT");
  ensureColumn(sqlite, "users", "pwa_display_mode", "TEXT");
  ensureColumn(sqlite, "invites", "reusable", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(sqlite, "woods", "hold_duration_ms", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(sqlite, "woods", "streak_count_after", "INTEGER");
  ensureColumn(sqlite, "woods", "streak_incremented", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(sqlite, "streaks", "milestones_sent", "TEXT NOT NULL DEFAULT '[]'");
}

function ensureColumn(sqlite, table, column, definition) {
  const columns = sqlite.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some((item) => item.name === column)) {
    sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function importLegacyJsonIfNeeded(sqlite) {
  const userCount = sqlite.prepare("SELECT COUNT(*) AS count FROM users").get().count;
  if (userCount > 0 || !fs.existsSync(config.dataFile)) return;

  const legacy = JSON.parse(fs.readFileSync(config.dataFile, "utf8"));
  persistSnapshot(sqlite, normalizeDb(legacy));
}

async function seedFirstAdmin(store) {
  if (store.db.users.length) return;
  await store.write(async (db) => {
    const admin = {
      id: id("user"),
      username: "admin",
      email: "admin@example.com",
      password_hash: await hashPassword("wood-admin"),
      role: "admin",
      suspended: false,
      favourite_wood: "",
      birthday_month: null,
      birthday_day: null,
      birthday_visible: false,
      notification_snoozed_until: null,
      pwa_installed_at: null,
      pwa_last_seen_at: null,
      pwa_display_mode: null,
      created_at: nowIso(),
      last_active_at: null,
      deleted_at: null,
    };
    db.users.push(admin);
    db.invites.push({
      id: id("invite"),
      code: inviteCode(),
      created_by: admin.id,
      expires_at: addDaysIso(7),
      used_by: null,
      used_at: null,
      reusable: false,
      revoked_at: null,
      created_at: nowIso(),
    });
  });
}

function loadSnapshot(sqlite) {
  const configRow = sqlite.prepare("SELECT config_json FROM app_config WHERE id = 1").get();
  return normalizeDb({
    users: sqlite.prepare("SELECT * FROM users ORDER BY created_at, id").all(),
    push_subs: sqlite.prepare("SELECT * FROM push_subs ORDER BY created_at, id").all(),
    invites: sqlite.prepare("SELECT * FROM invites ORDER BY created_at, id").all(),
    password_resets: sqlite.prepare("SELECT * FROM password_resets ORDER BY created_at, id").all(),
    notifications: sqlite.prepare("SELECT * FROM notifications ORDER BY created_at, id").all(),
    friendships: sqlite.prepare("SELECT * FROM friendships ORDER BY created_at, id").all(),
    woods: sqlite.prepare("SELECT * FROM woods ORDER BY sent_at, id").all(),
    mutes: sqlite.prepare("SELECT * FROM mutes ORDER BY id").all(),
    groups: sqlite.prepare("SELECT * FROM groups ORDER BY created_at, id").all(),
    group_members: sqlite.prepare("SELECT * FROM group_members ORDER BY created_at, id").all(),
    group_woods: sqlite.prepare("SELECT * FROM group_woods ORDER BY sent_at, id").all(),
    streaks: sqlite.prepare("SELECT * FROM streaks ORDER BY updated_at, id").all(),
    achievements_def: sqlite.prepare("SELECT * FROM achievements_def ORDER BY rowid").all(),
    achievements_earned: sqlite.prepare("SELECT * FROM achievements_earned ORDER BY earned_at, id").all(),
    achievement_events: sqlite.prepare("SELECT * FROM achievement_events ORDER BY created_at, id").all(),
    config: configRow ? JSON.parse(configRow.config_json) : initialConfig,
  });
}

function normalizeDb(db) {
  return {
    users: (db.users || []).map((user) => ({
      ...user,
      suspended: Boolean(user.suspended),
      favourite_wood: user.favourite_wood || "",
      birthday_month: user.birthday_month ?? null,
      birthday_day: user.birthday_day ?? null,
      birthday_visible: Boolean(user.birthday_visible),
      notification_snoozed_until: user.notification_snoozed_until || null,
      pwa_installed_at: user.pwa_installed_at || null,
      pwa_last_seen_at: user.pwa_last_seen_at || null,
      pwa_display_mode: user.pwa_display_mode || null,
      deleted_at: user.deleted_at || null,
    })),
    push_subs: db.push_subs || [],
    invites: (db.invites || []).map((invite) => ({
      ...invite,
      reusable: Boolean(invite.reusable),
    })),
    password_resets: db.password_resets || [],
    notifications: (db.notifications || []).map((notification) => ({
      ...notification,
      url: notification.url || "",
      actor_id: notification.actor_id || null,
      data_json: notification.data_json || "{}",
      dedupe_key: notification.dedupe_key || null,
      read_at: notification.read_at || null,
    })),
    friendships: db.friendships || [],
    woods: (db.woods || []).map((wood) => ({
      ...wood,
      type: wood.type || "normal",
      label: wood.label || "Wood",
      hold_duration_ms: Number(wood.hold_duration_ms || 0),
      streak_count_after:
        wood.streak_count_after === undefined ? null : wood.streak_count_after,
      streak_incremented: Boolean(wood.streak_incremented),
    })),
    mutes: db.mutes || [],
    groups: (db.groups || []).map((group) => ({
      ...group,
      dissolved_at: group.dissolved_at || null,
    })),
    group_members: db.group_members || [],
    group_woods: (db.group_woods || []).map((wood) => ({
      ...wood,
      type: wood.type || "normal",
      label: wood.label || "Wood",
      hold_duration_ms: Number(wood.hold_duration_ms || 0),
    })),
    streaks: (db.streaks || []).map((streak) => ({
      ...streak,
      current_streak: Number(streak.current_streak || 0),
      longest_streak: Number(streak.longest_streak || 0),
      at_risk: Boolean(streak.at_risk),
      milestones_sent: Array.isArray(streak.milestones_sent)
        ? streak.milestones_sent
        : JSON.parse(streak.milestones_sent || "[]"),
    })),
    achievements_def: (db.achievements_def || []).map(normalizeAchievementDef),
    achievements_earned: db.achievements_earned || [],
    achievement_events: (db.achievement_events || []).map((event) => ({
      ...event,
      subject_id: event.subject_id || null,
      meta_json: event.meta_json || "{}",
    })),
    config: { ...initialConfig, ...(db.config || {}) },
  };
}

function persistSnapshot(sqlite, db) {
  const snapshot = normalizeDb(db);
  const transaction = sqlite.transaction(() => {
    sqlite.exec(`
      DELETE FROM achievements_earned;
      DELETE FROM achievements_def;
      DELETE FROM achievement_events;
      DELETE FROM mutes;
      DELETE FROM streaks;
      DELETE FROM group_woods;
      DELETE FROM group_members;
      DELETE FROM groups;
      DELETE FROM woods;
      DELETE FROM friendships;
      DELETE FROM push_subs;
      DELETE FROM invites;
      DELETE FROM password_resets;
      DELETE FROM notifications;
      DELETE FROM users;
      DELETE FROM app_config;
    `);

    const insertUser = sqlite.prepare(`
      INSERT INTO users
        (
          id, username, email, password_hash, role, suspended, favourite_wood,
          birthday_month, birthday_day, birthday_visible, notification_snoozed_until,
          pwa_installed_at, pwa_last_seen_at, pwa_display_mode,
          created_at, last_active_at, deleted_at
        )
      VALUES
        (
          @id, @username, @email, @password_hash, @role, @suspended, @favourite_wood,
          @birthday_month, @birthday_day, @birthday_visible, @notification_snoozed_until,
          @pwa_installed_at, @pwa_last_seen_at, @pwa_display_mode,
          @created_at, @last_active_at, @deleted_at
        )
    `);
    for (const user of snapshot.users) {
      insertUser.run({
        ...user,
        suspended: user.suspended ? 1 : 0,
        birthday_visible: user.birthday_visible ? 1 : 0,
        notification_snoozed_until: user.notification_snoozed_until || null,
        pwa_installed_at: user.pwa_installed_at || null,
        pwa_last_seen_at: user.pwa_last_seen_at || null,
        pwa_display_mode: user.pwa_display_mode || null,
        deleted_at: user.deleted_at || null,
      });
    }

    const insertInvite = sqlite.prepare(`
      INSERT INTO invites
        (id, code, created_by, expires_at, used_by, used_at, reusable, revoked_at, created_at)
      VALUES
        (@id, @code, @created_by, @expires_at, @used_by, @used_at, @reusable, @revoked_at, @created_at)
    `);
    for (const invite of snapshot.invites) {
      insertInvite.run({
        ...invite,
        reusable: invite.reusable ? 1 : 0,
      });
    }

    const insertPasswordReset = sqlite.prepare(`
      INSERT INTO password_resets
        (id, user_id, token_hash, expires_at, used_at, created_by, created_at)
      VALUES
        (@id, @user_id, @token_hash, @expires_at, @used_at, @created_by, @created_at)
    `);
    for (const reset of snapshot.password_resets) {
      insertPasswordReset.run({
        ...reset,
        used_at: reset.used_at || null,
        created_by: reset.created_by || null,
      });
    }

    const insertNotification = sqlite.prepare(`
      INSERT INTO notifications
        (
          id, user_id, type, title, body, url, actor_id, data_json,
          dedupe_key, read_at, created_at
        )
      VALUES
        (
          @id, @user_id, @type, @title, @body, @url, @actor_id, @data_json,
          @dedupe_key, @read_at, @created_at
        )
    `);
    for (const notification of snapshot.notifications) {
      insertNotification.run({
        ...notification,
        url: notification.url || null,
        actor_id: notification.actor_id || null,
        data_json: notification.data_json || "{}",
        dedupe_key: notification.dedupe_key || null,
        read_at: notification.read_at || null,
      });
    }

    const insertPushSub = sqlite.prepare(`
      INSERT INTO push_subs
        (id, user_id, endpoint, p256dh, auth, created_at, updated_at)
      VALUES
        (@id, @user_id, @endpoint, @p256dh, @auth, @created_at, @updated_at)
    `);
    for (const sub of snapshot.push_subs) insertPushSub.run(sub);

    const insertFriendship = sqlite.prepare(`
      INSERT INTO friendships
        (id, requester_id, addressee_id, status, blocked_by, created_at, updated_at)
      VALUES
        (@id, @requester_id, @addressee_id, @status, @blocked_by, @created_at, @updated_at)
    `);
    for (const friendship of snapshot.friendships) {
      insertFriendship.run({
        blocked_by: null,
        updated_at: friendship.created_at,
        ...friendship,
      });
    }

    const insertWood = sqlite.prepare(`
      INSERT INTO woods
        (
          id, sender_id, recipient_id, sent_at, type, label, hold_duration_ms,
          streak_count_after, streak_incremented
        )
      VALUES
        (
          @id, @sender_id, @recipient_id, @sent_at, @type, @label,
          @hold_duration_ms, @streak_count_after, @streak_incremented
        )
    `);
    for (const wood of snapshot.woods) {
      insertWood.run({
        ...wood,
        hold_duration_ms: Number(wood.hold_duration_ms || 0),
        streak_count_after: wood.streak_count_after ?? null,
        streak_incremented: wood.streak_incremented ? 1 : 0,
      });
    }

    const insertMute = sqlite.prepare(`
      INSERT OR IGNORE INTO mutes (id, muter_id, muted_id)
      VALUES (@id, @muter_id, @muted_id)
    `);
    for (const mute of snapshot.mutes) insertMute.run(mute);

    const insertGroup = sqlite.prepare(`
      INSERT INTO groups
        (id, name, created_by, created_at, dissolved_at)
      VALUES
        (@id, @name, @created_by, @created_at, @dissolved_at)
    `);
    for (const group of snapshot.groups) {
      insertGroup.run({
        ...group,
        dissolved_at: group.dissolved_at || null,
      });
    }

    const insertGroupMember = sqlite.prepare(`
      INSERT OR IGNORE INTO group_members
        (id, group_id, user_id, invited_by, status, created_at, updated_at)
      VALUES
        (@id, @group_id, @user_id, @invited_by, @status, @created_at, @updated_at)
    `);
    for (const member of snapshot.group_members) {
      insertGroupMember.run({
        updated_at: member.created_at,
        ...member,
      });
    }

    const insertGroupWood = sqlite.prepare(`
      INSERT INTO group_woods
        (id, group_id, sender_id, sent_at, type, label, hold_duration_ms)
      VALUES
        (@id, @group_id, @sender_id, @sent_at, @type, @label, @hold_duration_ms)
    `);
    for (const wood of snapshot.group_woods) {
      insertGroupWood.run({
        ...wood,
        hold_duration_ms: Number(wood.hold_duration_ms || 0),
      });
    }

    const insertStreak = sqlite.prepare(`
      INSERT INTO streaks
        (
          id, user_a_id, user_b_id, current_streak, longest_streak,
          last_exchange_at, at_risk, milestones_sent, updated_at
        )
      VALUES
        (
          @id, @user_a_id, @user_b_id, @current_streak, @longest_streak,
          @last_exchange_at, @at_risk, @milestones_sent, @updated_at
        )
    `);
    for (const streak of snapshot.streaks) {
      insertStreak.run({
        ...streak,
        at_risk: streak.at_risk ? 1 : 0,
        milestones_sent: JSON.stringify(streak.milestones_sent || []),
      });
    }

    const insertAchievementDef = sqlite.prepare(`
      INSERT INTO achievements_def
        (
          id, slug, name, description, icon, secret, criteria_type, criteria_value
        )
      VALUES
        (
          @id, @slug, @name, @description, @icon, @secret, @criteria_type,
          @criteria_value
        )
    `);
    for (const achievement of snapshot.achievements_def) {
      insertAchievementDef.run({
        ...achievement,
        secret: achievement.secret ? 1 : 0,
        criteria_value: String(achievement.criteria_value),
      });
    }

    const insertAchievementEarned = sqlite.prepare(`
      INSERT OR IGNORE INTO achievements_earned
        (id, user_id, achievement_id, earned_at)
      VALUES
        (@id, @user_id, @achievement_id, @earned_at)
    `);
    for (const earned of snapshot.achievements_earned) {
      insertAchievementEarned.run(earned);
    }

    const insertAchievementEvent = sqlite.prepare(`
      INSERT INTO achievement_events
        (id, user_id, type, subject_id, meta_json, created_at)
      VALUES
        (@id, @user_id, @type, @subject_id, @meta_json, @created_at)
    `);
    for (const event of snapshot.achievement_events) {
      insertAchievementEvent.run({
        ...event,
        subject_id: event.subject_id || null,
        meta_json: event.meta_json || "{}",
      });
    }

    sqlite
      .prepare("INSERT INTO app_config (id, config_json) VALUES (1, ?)")
      .run(JSON.stringify(snapshot.config));
  });
  transaction();
}
