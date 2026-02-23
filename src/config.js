import "dotenv/config";

export const config = {
  appName: process.env.APP_NAME || "Entrenadora IA",
  debug: process.env.DEBUG === "true",
  baseUrl: process.env.BASE_URL || "http://localhost:3000",

  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY || "",
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514",
  },

  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID || "",
    authToken: process.env.TWILIO_AUTH_TOKEN || "",
    whatsappNumber: process.env.TWILIO_WHATSAPP_NUMBER || "",
  },

  userPhone: process.env.USER_PHONE || "+56987507237",

  strava: {
    clientId: process.env.STRAVA_CLIENT_ID || "",
    clientSecret: process.env.STRAVA_CLIENT_SECRET || "",
    redirectUri: process.env.STRAVA_REDIRECT_URI || "",
  },

  databaseUrl: process.env.DATABASE_URL || "./data/coach.db",

  // RAG: embeddings con OpenAI (opcional; si no hay key, el RAG no se usa)
  openai: {
    apiKey: process.env.OPENAI_API_KEY || "",
    embeddingModel: process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small",
  },

  plan: {
    deliveryDay: process.env.PLAN_DELIVERY_DAY || "monday",
    deliveryHour: parseInt(process.env.PLAN_DELIVERY_HOUR || "7", 10),
    deliveryMinute: parseInt(process.env.PLAN_DELIVERY_MINUTE || "0", 10),
    weeksCount: parseInt(process.env.PLANNING_WEEKS_COUNT || "20", 10),
    timezone: process.env.TIMEZONE || "America/Santiago",
  },
};
