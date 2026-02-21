import cron from "node-cron";
import { db } from "./db.js";
import { sendWhatsApp } from "./services/whatsapp.js";
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

function jobSendWeeklyPlan() {
  const phone = config.userPhone;
  const user = db.prepare("SELECT id, phone, plan_delivery_paused FROM users WHERE phone = ?").get(phone);
  if (!user || user.plan_delivery_paused) return;
  const { start, end } = getWeekBounds();
  const today = new Date().toISOString().slice(0, 10);
  const row = db.prepare(`
    SELECT pw.week_start, pw.week_end, pw.content
    FROM planning_weeks pw
    JOIN planning_periods pp ON pp.id = pw.period_id
    JOIN users u ON u.id = pp.user_id
    WHERE u.phone = ? AND pp.is_active = 1 AND pw.week_start <= ? AND pw.week_end >= ?
  `).get(phone, today, today);
  if (!row) return;
  const text = `Plan de la semana (${row.week_start} - ${row.week_end}):\n\n${row.content}`;
  sendWhatsApp(user.phone, text);
}

const DAYS_CRON = { monday: "1", tuesday: "2", wednesday: "3", thursday: "4", friday: "5", saturday: "6", sunday: "0" };

export function startScheduler() {
  const day = DAYS_CRON[config.plan.deliveryDay.toLowerCase()] || "1";
  const hour = config.plan.deliveryHour;
  const minute = config.plan.deliveryMinute;
  // node-cron: min hour day-of-month month day-of-week
  const expr = `${minute} ${hour} * * ${day}`;
  cron.schedule(expr, jobSendWeeklyPlan, { timezone: config.plan.timezone });
}
