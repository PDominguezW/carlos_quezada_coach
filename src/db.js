import Database from "better-sqlite3";
import { config } from "./config.js";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import fs from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = config.databaseUrl.startsWith("/") ? config.databaseUrl : join(process.cwd(), config.databaseUrl);
const dir = dirname(dbPath);
if (dir && dir !== ".") {
  fs.mkdirSync(dir, { recursive: true });
}

export const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT UNIQUE NOT NULL,
    plan_delivery_day TEXT DEFAULT 'monday',
    plan_delivery_hour INTEGER DEFAULT 7,
    plan_delivery_minute INTEGER DEFAULT 0,
    plan_delivery_paused INTEGER DEFAULT 0,
    timezone TEXT DEFAULT 'America/Santiago',
    pending_delete_confirm INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS planning_periods (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    total_weeks INTEGER NOT NULL,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS planning_weeks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    period_id INTEGER NOT NULL REFERENCES planning_periods(id),
    week_number INTEGER NOT NULL,
    week_start TEXT NOT NULL,
    week_end TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS user_preferences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    kind TEXT DEFAULT 'rule',
    content TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS strava_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER UNIQUE NOT NULL REFERENCES users(id),
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS strava_activities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    strava_id TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    activity_type TEXT NOT NULL,
    start_date TEXT NOT NULL,
    distance_m REAL DEFAULT 0,
    moving_time_s INTEGER DEFAULT 0,
    elapsed_time_s INTEGER DEFAULT 0,
    summary TEXT,
    user_notes TEXT,
    feedback_requested INTEGER DEFAULT 0,
    feedback_received INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_messages_user ON messages(user_id);
  CREATE INDEX IF NOT EXISTS idx_planning_weeks_period ON planning_weeks(period_id);
  CREATE INDEX IF NOT EXISTS idx_planning_periods_user ON planning_periods(user_id);
  CREATE INDEX IF NOT EXISTS idx_strava_activities_user ON strava_activities(user_id);
`);

export function getOrCreateUser(phone) {
  let user = db.prepare("SELECT * FROM users WHERE phone = ?").get(phone);
  if (user) return user;
  db.prepare(`
    INSERT INTO users (phone, plan_delivery_day, plan_delivery_hour, plan_delivery_minute, timezone)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    phone,
    config.plan.deliveryDay,
    config.plan.deliveryHour,
    config.plan.deliveryMinute,
    config.plan.timezone
  );
  return db.prepare("SELECT * FROM users WHERE phone = ?").get(phone);
}

export function getLastMessages(userId, limit = 20) {
  return db.prepare(
    "SELECT role, content FROM messages WHERE user_id = ? ORDER BY id DESC LIMIT ?"
  ).all(userId, limit).reverse();
}

export function addMessage(userId, role, content) {
  return db.prepare("INSERT INTO messages (user_id, role, content) VALUES (?, ?, ?)").run(userId, role, content);
}
