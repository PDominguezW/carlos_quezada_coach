import * as handlers from "./handlers.js";

const TOOLS_DEFINITIONS = [
  {
    name: "change_plan_delivery_day",
    description: "Cambiar el día de la semana en que se envía el plan de entrenamiento (ej. a martes o lunes).",
    input_schema: {
      type: "object",
      properties: {
        day: {
          type: "string",
          description: "Día en inglés: monday, tuesday, ...",
          enum: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
        },
      },
      required: ["day"],
    },
  },
  {
    name: "change_plan_delivery_schedule",
    description: "Cambiar día y hora de envío del plan.",
    input_schema: {
      type: "object",
      properties: {
        day: { type: "string", enum: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] },
        hour: { type: "integer", description: "Hora (0-23)", minimum: 0, maximum: 23 },
        minute: { type: "integer", description: "Minuto (0-59)", minimum: 0, maximum: 59 },
      },
      required: ["day", "hour", "minute"],
    },
  },
  {
    name: "reset_planning",
    description: "Empezar la planificación desde cero. Borra el plan actual.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "send_plan_now",
    description: "Obtener el plan de la semana actual para mostrarlo/enviarlo al usuario.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_current_plan_week",
    description: "Obtener el contenido del plan de la semana actual.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_planning_status",
    description: "Saber en qué semana de planificación va el usuario y cuántas quedan.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "pause_plan_delivery",
    description: "Pausar el envío automático del plan.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "resume_plan_delivery",
    description: "Reanudar el envío automático del plan.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_strava_connect_url",
    description: "Obtener el enlace para que el usuario conecte su Strava.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "disconnect_strava",
    description: "Desconectar la cuenta de Strava del usuario.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "sync_strava_activities",
    description: "Sincronizar actividades recientes de Strava.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "update_activity_notes",
    description: "Guardar notas o corrección del usuario sobre una actividad.",
    input_schema: {
      type: "object",
      properties: {
        activity_id: { type: "string" },
        user_notes: { type: "string" },
      },
      required: ["activity_id", "user_notes"],
    },
  },
  {
    name: "add_preference_or_rule",
    description: "Guardar preferencia, regla o nota para la entrenadora.",
    input_schema: {
      type: "object",
      properties: {
        content: { type: "string" },
        kind: { type: "string", enum: ["rule", "preference", "note"] },
      },
      required: ["content"],
    },
  },
  {
    name: "get_my_stored_info_summary",
    description: "Resumen de lo guardado del usuario (preferencias, plan) sin borrar.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "delete_all_my_data",
    description: "Eliminar TODO del usuario. SOLO llamar tras confirmación explícita (SÍ).",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "clear_preferences",
    description: "Borrar solo las preferencias/reglas guardadas.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_today_plan",
    description: "Obtener qué tiene el usuario planeado para hoy.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_week_summary",
    description: "Resumen de entrenamiento de la semana.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "set_timezone",
    description: "Cambiar la zona horaria del usuario.",
    input_schema: {
      type: "object",
      properties: { timezone: { type: "string" } },
      required: ["timezone"],
    },
  },
  {
    name: "generate_new_planning",
    description: "Generar una nueva planificación de entrenamiento (N semanas, método noruego) y guardarla. Usar cuando el usuario pida empezar de cero o generar nueva planificación.",
    input_schema: { type: "object", properties: {} },
  },
];

const HANDLERS = {
  change_plan_delivery_day: handlers.changePlanDeliveryDay,
  change_plan_delivery_schedule: handlers.changePlanDeliverySchedule,
  reset_planning: handlers.resetPlanning,
  send_plan_now: handlers.sendPlanNow,
  get_current_plan_week: handlers.getCurrentPlanWeek,
  get_planning_status: handlers.getPlanningStatus,
  pause_plan_delivery: handlers.pausePlanDelivery,
  resume_plan_delivery: handlers.resumePlanDelivery,
  get_strava_connect_url: handlers.getStravaConnectUrl,
  disconnect_strava: handlers.disconnectStrava,
  sync_strava_activities: handlers.syncStravaActivities,
  update_activity_notes: handlers.updateActivityNotes,
  add_preference_or_rule: handlers.addPreferenceOrRule,
  get_my_stored_info_summary: handlers.getMyStoredInfoSummary,
  delete_all_my_data: handlers.deleteAllMyData,
  clear_preferences: handlers.clearPreferences,
  get_today_plan: handlers.getTodayPlan,
  get_week_summary: handlers.getWeekSummary,
  set_timezone: handlers.setTimezone,
  generate_new_planning: handlers.generateNewPlanning,
};

export function getToolsDefinitions() {
  return TOOLS_DEFINITIONS;
}

export async function runTool(name, args, userId, db) {
  const handler = HANDLERS[name];
  if (!handler) return `Error: herramienta desconocida '${name}'.`;
  try {
    const result = handler(db, userId, args || {});
    const value = result instanceof Promise ? await result : result;
    return typeof value === "string" ? value : String(value);
  } catch (e) {
    return `Error al ejecutar ${name}: ${e.message}`;
  }
}
