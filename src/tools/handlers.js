import { config } from "../config.js";
import { getAccessToken, fetchActivities } from "../services/strava.js";
import { generateAndSavePlanning } from "../services/planningGenerator.js";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function getWeekBounds() {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d);
  monday.setDate(diff);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    start: monday.toISOString().slice(0, 10),
    end: sunday.toISOString().slice(0, 10),
  };
}

export function changePlanDeliveryDay(db, userId, args) {
  const day = (args.day || "").toLowerCase();
  db.prepare("UPDATE users SET plan_delivery_day = ?, updated_at = datetime('now') WHERE id = ?").run(day, userId);
  return `Listo. A partir de ahora te enviaré el plan los ${day}.`;
}

export function changePlanDeliverySchedule(db, userId, args) {
  const { day, hour, minute } = args;
  db.prepare(
    "UPDATE users SET plan_delivery_day = ?, plan_delivery_hour = ?, plan_delivery_minute = ?, updated_at = datetime('now') WHERE id = ?"
  ).run((day || "").toLowerCase(), hour ?? 7, minute ?? 0, userId);
  return `Listo. Te enviaré el plan los ${day} a las ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}.`;
}

export function resetPlanning(db, userId) {
  const periods = db.prepare("SELECT id FROM planning_periods WHERE user_id = ?").all(userId);
  for (const p of periods) {
    db.prepare("DELETE FROM planning_weeks WHERE period_id = ?").run(p.id);
  }
  db.prepare("DELETE FROM planning_periods WHERE user_id = ?").run(userId);
  return "Planificación reiniciada. La próxima vez que toque enviar plan, generaré uno nuevo desde cero.";
}

export function sendPlanNow(db, userId) {
  const today = todayStr();
  const row = db.prepare(`
    SELECT pw.week_start, pw.week_end, pw.content
    FROM planning_weeks pw
    JOIN planning_periods pp ON pp.id = pw.period_id
    WHERE pp.user_id = ? AND pp.is_active = 1 AND pw.week_start <= ? AND pw.week_end >= ?
  `).get(userId, today, today);
  if (!row) return "No hay planificación activa para esta semana. ¿Quieres que genere una nueva?";
  return `Plan de esta semana (${row.week_start} - ${row.week_end}):\n\n${row.content}`;
}

export function getCurrentPlanWeek(db, userId) {
  const today = todayStr();
  const row = db.prepare(`
    SELECT pw.week_start, pw.week_end, pw.content
    FROM planning_weeks pw
    JOIN planning_periods pp ON pp.id = pw.period_id
    WHERE pp.user_id = ? AND pp.is_active = 1 AND pw.week_start <= ? AND pw.week_end >= ?
  `).get(userId, today, today);
  if (!row) return "No hay plan definido para esta semana.";
  return `Semana del ${row.week_start} al ${row.week_end}:\n${row.content}`;
}

export function getPlanningStatus(db, userId) {
  const today = todayStr();
  const row = db.prepare(`
    SELECT pp.total_weeks, pw.week_number
    FROM planning_weeks pw
    JOIN planning_periods pp ON pp.id = pw.period_id
    WHERE pp.user_id = ? AND pp.is_active = 1 AND pw.week_start <= ? AND pw.week_end >= ?
  `).get(userId, today, today);
  if (!row) return "No hay planificación activa.";
  const remaining = row.total_weeks - row.week_number;
  return `Vas en la semana ${row.week_number} de ${row.total_weeks}. Faltan ${remaining} semanas.`;
}

export function pausePlanDelivery(db, userId) {
  db.prepare("UPDATE users SET plan_delivery_paused = 1, updated_at = datetime('now') WHERE id = ?").run(userId);
  return "He pausado el envío del plan. Cuando quieras reanudarlo, dímelo.";
}

export function resumePlanDelivery(db, userId) {
  db.prepare("UPDATE users SET plan_delivery_paused = 0, updated_at = datetime('now') WHERE id = ?").run(userId);
  return "Reanudado. Te volveré a enviar el plan en el día y hora configurados.";
}

export function getStravaConnectUrl(db, userId, args) {
  const { clientId, redirectUri } = config.strava;
  if (!clientId) return "Strava no está configurado. Avisa al administrador.";
  const url = `https://www.strava.com/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri || "")}&response_type=code&scope=read,activity:read_all,profile:read_all&approval_prompt=auto&state=${userId}`;
  return `Conecta tu Strava abriendo este enlace:\n${url}`;
}

export function disconnectStrava(db, userId) {
  db.prepare("DELETE FROM strava_tokens WHERE user_id = ?").run(userId);
  return "Strava desconectado.";
}

export async function syncStravaActivities(db, userId) {
  const token = await getAccessToken(userId);
  if (!token) return "No tienes Strava conectado. Pídeme el enlace para conectar.";
  const activities = await fetchActivities(userId, 30);
  if (!activities || !Array.isArray(activities)) return "No pude obtener actividades de Strava. ¿Puedes intentar de nuevo?";
  const insert = db.prepare(`
    INSERT OR IGNORE INTO strava_activities (user_id, strava_id, name, activity_type, start_date, distance_m, moving_time_s, elapsed_time_s, summary)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  let added = 0;
  for (const a of activities) {
    const summary = JSON.stringify({
      distance_km: (a.distance / 1000).toFixed(2),
      pace: a.average_speed ? (1000 / 60 / (a.average_speed || 1)).toFixed(1) + " min/km" : null,
    });
    insert.run(
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
    if (db.prepare("SELECT changes()").get().changes > 0) added++;
  }
  return added === 0
    ? "No había actividades nuevas. Ya tenía todo sincronizado."
    : `Listo. Añadí ${added} actividad(es) nueva(s). Ya las tengo en cuenta.`;
}

export function updateActivityNotes(db, userId, args) {
  const { activity_id, user_notes } = args || {};
  let act = db.prepare("SELECT id FROM strava_activities WHERE user_id = ? AND strava_id = ?").get(userId, activity_id);
  if (!act && /^\d+$/.test(activity_id)) {
    act = db.prepare("SELECT id FROM strava_activities WHERE user_id = ? AND id = ?").get(userId, parseInt(activity_id, 10));
  }
  if (!act) return `No encontré la actividad ${activity_id}. ¿Puedes decirme el nombre o la fecha?`;
  db.prepare("UPDATE strava_activities SET user_notes = ?, feedback_received = 1 WHERE id = ?").run(user_notes, act.id);
  return "Anotado. Lo tendré en cuenta.";
}

export function addPreferenceOrRule(db, userId, args) {
  const content = args.content || "";
  const kind = args.kind || "rule";
  db.prepare("INSERT INTO user_preferences (user_id, kind, content) VALUES (?, ?, ?)").run(userId, kind, content);
  return "Lo he guardado y lo tendré en cuenta.";
}

export function getMyStoredInfoSummary(db, userId) {
  const prefs = db.prepare("SELECT kind, content FROM user_preferences WHERE user_id = ?").all(userId);
  const period = db.prepare("SELECT start_date, end_date, total_weeks FROM planning_periods WHERE user_id = ? AND is_active = 1").get(userId);
  const lines = ["Preferencias/reglas guardadas:"];
  for (const p of prefs) lines.push(`- [${p.kind}] ${p.content}`);
  if (period) {
    lines.push(`\nPlanificación activa: desde ${period.start_date} hasta ${period.end_date} (${period.total_weeks} semanas).`);
  } else {
    lines.push("\nNo hay planificación activa.");
  }
  return lines.join("\n") || "No hay nada guardado.";
}

export function deleteAllMyData(db, userId) {
  const user = db.prepare("SELECT pending_delete_confirm FROM users WHERE id = ?").get(userId);
  if (!user) return "Usuario no encontrado.";
  if (!user.pending_delete_confirm) {
    db.prepare("UPDATE users SET pending_delete_confirm = 1, updated_at = datetime('now') WHERE id = ?").run(userId);
    return "Para borrar todo lo que sé de ti, responde exactamente: SÍ";
  }
  const periods = db.prepare("SELECT id FROM planning_periods WHERE user_id = ?").all(userId);
  for (const p of periods) db.prepare("DELETE FROM planning_weeks WHERE period_id = ?").run(p.id);
  db.prepare("DELETE FROM planning_periods WHERE user_id = ?").run(userId);
  db.prepare("DELETE FROM messages WHERE user_id = ?").run(userId);
  db.prepare("DELETE FROM user_preferences WHERE user_id = ?").run(userId);
  db.prepare("DELETE FROM strava_activities WHERE user_id = ?").run(userId);
  db.prepare("DELETE FROM strava_tokens WHERE user_id = ?").run(userId);
  db.prepare("UPDATE users SET pending_delete_confirm = 0, updated_at = datetime('now') WHERE id = ?").run(userId);
  return "He borrado todo lo que tenía guardado de ti. Empezamos de cero.";
}

export function clearPreferences(db, userId) {
  db.prepare("DELETE FROM user_preferences WHERE user_id = ?").run(userId);
  return "Preferencias y reglas borradas.";
}

export function getTodayPlan(db, userId) {
  const today = todayStr();
  const row = db.prepare(`
    SELECT pw.content FROM planning_weeks pw
    JOIN planning_periods pp ON pp.id = pw.period_id
    WHERE pp.user_id = ? AND pp.is_active = 1 AND pw.week_start <= ? AND pw.week_end >= ?
  `).get(userId, today, today);
  if (!row) return "No hay plan esta semana. ¿Quieres que genere una nueva planificación?";
  return `Hoy corresponde según tu plan:\n${row.content}`;
}

export function getWeekSummary(db, userId) {
  const { start, end } = getWeekBounds();
  const acts = db.prepare(`
    SELECT name, activity_type, start_date, moving_time_s
    FROM strava_activities
    WHERE user_id = ? AND date(start_date) >= ? AND date(start_date) <= ?
    ORDER BY start_date
  `).all(userId, start, end);
  if (!acts.length) return "Esta semana no hay actividades registradas en Strava aún.";
  const lines = [`Resumen semana ${start} - ${end}:`];
  for (const a of acts) {
    const min = Math.floor((a.moving_time_s || 0) / 60);
    lines.push(`- ${a.start_date.slice(0, 10)}: ${a.name} (${a.activity_type}), ${min} min`);
  }
  return lines.join("\n");
}

export function setTimezone(db, userId, args) {
  const tz = args.timezone || "";
  db.prepare("UPDATE users SET timezone = ?, updated_at = datetime('now') WHERE id = ?").run(tz, userId);
  return `Zona horaria actualizada a ${tz}.`;
}

export async function generateNewPlanning(db, userId, args) {
  return generateAndSavePlanning(db, userId);
}
