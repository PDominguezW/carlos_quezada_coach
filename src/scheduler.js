import cron from "node-cron";
import { db } from "./db.js";
import { sendWhatsApp } from "./services/whatsapp.js";
import { syncAndReturnNew } from "./services/strava.js";
import { config } from "./config.js";

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

async function jobSendWeeklyPlan() {
  const phone = config.userPhone;
  const user = db.prepare("SELECT id, phone, plan_delivery_paused FROM users WHERE phone = ?").get(phone);
  if (!user || user.plan_delivery_paused) return;
  const today = new Date().toISOString().slice(0, 10);
  let row = db.prepare(`
    SELECT pw.week_start, pw.week_end, pw.content
    FROM planning_weeks pw
    JOIN planning_periods pp ON pp.id = pw.period_id
    JOIN users u ON u.id = pp.user_id
    WHERE u.phone = ? AND pp.is_active = 1 AND pw.week_start <= ? AND pw.week_end >= ?
  `).get(phone, today, today);
  if (!row) {
    const hasPeriod = db.prepare("SELECT 1 FROM planning_periods WHERE user_id = ? AND is_active = 1").get(user.id);
    if (!hasPeriod) {
      try {
        const { generateAndSavePlanning } = await import("./services/planningGenerator.js");
        await generateAndSavePlanning(db, user.id);
        row = db.prepare(`
          SELECT pw.week_start, pw.week_end, pw.content
          FROM planning_weeks pw
          JOIN planning_periods pp ON pp.id = pw.period_id
          WHERE pp.user_id = ? AND pp.is_active = 1 AND pw.week_start <= ? AND pw.week_end >= ?
        `).get(user.id, today, today);
      } catch (e) {
        if (config.debug) console.error("Generate planning:", e);
      }
    }
  }
  if (!row) return;
  const text = `Plan de la semana (${row.week_start} - ${row.week_end}):\n\n${row.content}`;
  sendWhatsApp(user.phone, text);
}

function isActivityWeird(act) {
  const runLike = (act.activity_type || "").toLowerCase().includes("run") || (act.activity_type || "").toLowerCase().includes("carrera");
  if (act.moving_time_s < 60) return true; // menos de 1 min
  if (runLike && act.distance_m > 0 && act.moving_time_s === 0) return true;
  if (runLike && act.distance_m === 0 && act.moving_time_s > 300) return true; // 5+ min sin distancia
  return false;
}

async function jobStravaSyncAndNotify() {
  const phone = config.userPhone;
  const user = db.prepare("SELECT id, phone FROM users WHERE phone = ?").get(phone);
  if (!user) return;
  const tokenRow = db.prepare("SELECT 1 FROM strava_tokens WHERE user_id = ?").get(user.id);
  if (!tokenRow) return;
  try {
    const { newIds, activities } = await syncAndReturnNew(db, user.id);
    if (!newIds.length) return;
    const updateRequested = db.prepare("UPDATE strava_activities SET feedback_requested = 1 WHERE user_id = ? AND strava_id = ?");
    for (let i = 0; i < newIds.length; i++) {
      const stravaId = newIds[i];
      const act = activities[i];
      if (!act) continue;
      updateRequested.run(user.id, stravaId);
      const min = Math.floor((act.moving_time_s || 0) / 60);
      const km = ((act.distance_m || 0) / 1000).toFixed(1);
      const stats = `${min} min, ${km} km`;
      const weird = isActivityWeird(act);
      const msg = weird
        ? `Vi este entreno: ${act.name} (${stats}). ¿Fue error de Strava o pasó algo?`
        : `¿Cómo te fue en ${act.name}?`;
      sendWhatsApp(user.phone, msg);
    }
  } catch (e) {
    if (config.debug) console.error("Strava sync job:", e);
  }
}

const DAYS_CRON = { monday: "1", tuesday: "2", wednesday: "3", thursday: "4", friday: "5", saturday: "6", sunday: "0" };

export function startScheduler() {
  const day = DAYS_CRON[config.plan.deliveryDay.toLowerCase()] || "1";
  const hour = config.plan.deliveryHour;
  const minute = config.plan.deliveryMinute;
  const expr = `${minute} ${hour} * * ${day}`;
  cron.schedule(expr, jobSendWeeklyPlan, { timezone: config.plan.timezone });

  // Strava: sync + preguntar por actividades nuevas cada 2 horas
  cron.schedule("0 */2 * * *", jobStravaSyncAndNotify, { timezone: config.plan.timezone });
}
