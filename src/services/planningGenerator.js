import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";
import { searchKnowledge } from "../rag/search.js";

/**
 * Get next Monday from today (or today if today is Monday).
 */
function getNextMonday() {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? 1 : day === 1 ? 0 : 8 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  return monday.toISOString().slice(0, 10);
}

function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Generate planning text using Claude and RAG context, then parse and save.
 * @param {object} db - better-sqlite3 db
 * @param {number} userId
 * @returns {Promise<string>} result message
 */
export async function generateAndSavePlanning(db, userId) {
  const client = new Anthropic({ apiKey: config.anthropic.apiKey });
  const numWeeks = config.plan.weeksCount || 20;
  const ragContext = await searchKnowledge("método noruego planificación entrenamiento fisiología", { limit: 8 });
  const systemPrompt = `Eres una entrenadora experta en el método noruego de entrenamiento.
Genera una planificación de ${numWeeks} semanas para un corredor/atleta.
${ragContext ? `Contexto de referencia:\n${ragContext}` : ""}
Responde ÚNICAMENTE con un JSON válido, sin markdown ni texto extra. Formato:
{"weeks":[{"week_number":1,"content":"Lunes: ... Martes: ... (descripción día a día de la semana)"},{"week_number":2,"content":"..."}, ...]}
Cada "content" debe ser el plan de esa semana (días, tipo de entreno, volumen, intensidad).`;

  const response = await client.messages.create({
    model: config.anthropic.model,
    max_tokens: 8192,
    system: systemPrompt,
    messages: [{ role: "user", content: `Genera la planificación de ${numWeeks} semanas. Responde solo el JSON.` }],
  });
  const text = response.content.find((b) => b.type === "text")?.text || "";
  let data;
  try {
    const jsonStr = text.replace(/```json?\s*/g, "").replace(/```\s*$/g, "").trim();
    data = JSON.parse(jsonStr);
  } catch (e) {
    return "No pude generar el plan (error al parsear). Intenta de nuevo.";
  }
  const weeks = data?.weeks;
  if (!Array.isArray(weeks) || weeks.length === 0) return "No pude generar el plan. Intenta de nuevo.";

  const startDate = getNextMonday();
  const endDate = addDays(startDate, numWeeks * 7 - 1);
  db.prepare("UPDATE planning_periods SET is_active = 0 WHERE user_id = ?").run(userId);
  db.prepare(
    "INSERT INTO planning_periods (user_id, start_date, end_date, total_weeks, is_active) VALUES (?, ?, ?, ?, 1)"
  ).run(userId, startDate, endDate, weeks.length);

  const periodId = db.prepare("SELECT last_insert_rowid() as id").get().id;
  const insertWeek = db.prepare(
    "INSERT INTO planning_weeks (period_id, week_number, week_start, week_end, content) VALUES (?, ?, ?, ?, ?)"
  );
  for (let i = 0; i < weeks.length; i++) {
    const w = weeks[i];
    const weekStart = addDays(startDate, i * 7);
    const weekEnd = addDays(weekStart, 6);
    insertWeek.run(periodId, w.week_number ?? i + 1, weekStart, weekEnd, w.content || "");
  }
  return `He generado una nueva planificación de ${weeks.length} semanas (desde el ${startDate}). Te enviaré el plan cada semana en el día configurado.`;
}