import { config } from "../config.js";
import { db } from "../db.js";

const STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token";
const STRAVA_API = "https://www.strava.com/api/v3";

/**
 * Return valid access_token, refreshing if expired.
 */
export async function getAccessToken(userId) {
  const row = db.prepare("SELECT access_token, refresh_token, expires_at FROM strava_tokens WHERE user_id = ?").get(userId);
  if (!row) return null;
  const expiresAt = new Date(row.expires_at).getTime();
  if (expiresAt > Date.now() + 60000) return row.access_token;
  const body = new URLSearchParams({
    client_id: config.strava.clientId,
    client_secret: config.strava.clientSecret,
    grant_type: "refresh_token",
    refresh_token: row.refresh_token,
  });
  const res = await fetch(STRAVA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const expiresAtNew = new Date(data.expires_at * 1000).toISOString();
  db.prepare(
    "UPDATE strava_tokens SET access_token = ?, refresh_token = ?, expires_at = ?, updated_at = datetime('now') WHERE user_id = ?"
  ).run(data.access_token, data.refresh_token, expiresAtNew, userId);
  return data.access_token;
}

/**
 * Exchange authorization code for tokens and save.
 */
export async function exchangeCodeForTokens(code, userId) {
  const body = new URLSearchParams({
    client_id: config.strava.clientId,
    client_secret: config.strava.clientSecret,
    code,
    grant_type: "authorization_code",
  });
  const res = await fetch(STRAVA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) return false;
  const data = await res.json();
  const expiresAt = new Date(data.expires_at * 1000).toISOString();
  db.prepare("DELETE FROM strava_tokens WHERE user_id = ?").run(userId);
  db.prepare(
    "INSERT INTO strava_tokens (user_id, access_token, refresh_token, expires_at) VALUES (?, ?, ?, ?)"
  ).run(userId, data.access_token, data.refresh_token, expiresAt);
  return true;
}

/**
 * Fetch recent activities from Strava.
 */
export async function fetchActivities(userId, perPage = 30) {
  const token = await getAccessToken(userId);
  if (!token) return null;
  const res = await fetch(`${STRAVA_API}/athlete/activities?per_page=${perPage}&page=1`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  return res.json();
}

/**
 * Sync activities to DB and return list of newly inserted strava_ids.
 * @param {object} db - better-sqlite3
 * @param {number} userId
 * @returns {Promise<{ newIds: string[], activities: Array<{strava_id, name, activity_type, moving_time_s, distance_m}> }>}
 */
export async function syncAndReturnNew(db, userId) {
  const activities = await fetchActivities(userId, 30);
  if (!activities || !Array.isArray(activities)) return { newIds: [], activities: [] };
  const newIds = [];
  const insertedActivities = [];
  for (const a of activities) {
    const existing = db.prepare("SELECT strava_id FROM strava_activities WHERE user_id = ? AND strava_id = ?").get(userId, String(a.id));
    if (existing) continue;
    const summary = JSON.stringify({
      distance_km: (a.distance / 1000).toFixed(2),
      pace: a.average_speed ? (1000 / 60 / (a.average_speed || 1)).toFixed(1) + " min/km" : null,
    });
    db.prepare(`
      INSERT INTO strava_activities (user_id, strava_id, name, activity_type, start_date, distance_m, moving_time_s, elapsed_time_s, summary)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      userId,
      String(a.id),
      a.name || "Sin nombre",
      a.type || "Run",
      a.start_date,
      a.distance ?? 0,
      a.moving_time ?? 0,
      a.elapsed_time ?? 0,
      summary
    );
    newIds.push(String(a.id));
    insertedActivities.push({
      strava_id: String(a.id),
      name: a.name || "Sin nombre",
      activity_type: a.type || "Run",
      moving_time_s: a.moving_time ?? 0,
      distance_m: a.distance ?? 0,
    });
  }
  return { newIds, activities: insertedActivities };
}