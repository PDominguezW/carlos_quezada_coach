# Plan de implementación – Entrenadora IA por WhatsApp

## 1. Casos de uso (qué puede pedir el usuario)

### 1.1 Planificación
| Petición (ejemplos) | Acción / Tool | Notas |
|---------------------|---------------|--------|
| "Envíame el plan los martes" / "Que sea los martes" | `change_plan_delivery_day(day)` | Actualizar cron y preferencia |
| "Envíame el plan cada lunes a las 8" | `change_plan_delivery_schedule(day, hour)` | Idem |
| "Comenzemos desde 0" / "Resetear planificación" | `reset_planning()` | Borrar plan actual; siguiente lunes genera nuevo |
| "Envíame el plan de esta semana" / "Dame el plan ya" | `send_plan_now()` | Envía plan de la semana actual por WhatsApp |
| "¿Cuál es mi plan esta semana?" | `get_current_plan_week()` → respuesta con texto | Solo lectura |
| "¿En qué semana de planificación voy?" | `get_planning_status()` | Semana N de M, fechas |
| "¿Cuántas semanas faltan?" | Idem | |
| "Pausa el envío del plan" / "No me envíes más el plan por ahora" | `pause_plan_delivery()` | Flag en user/config |
| "Reanuda el envío del plan" | `resume_plan_delivery()` | |
| "Genera nueva planificación" (cuando se acaba) | Automático vía cron o `generate_new_planning()` | Tras reset o fin de periodo |

### 1.2 Strava
| Petición | Acción | Notas |
|----------|--------|--------|
| "Conectar Strava" / "Conecta mi Strava" | `get_strava_connect_url()` → enviar link | OAuth; guardar tokens |
| "Desconectar Strava" | `disconnect_strava()` | Borrar tokens |
| "¿Cómo fue mi último entreno?" | Leer última actividad + feedback si existe; comentar | No preguntar de nuevo si ya dijo |
| "Sincroniza Strava" | `sync_strava_activities()` | Manual |
| (Automático) Tras actividad nueva rara | Preguntar "Vi este entreno [resumen]. ¿Error de Strava o pasó algo?" | Guardar respuesta en actividad |
| (Automático) Tras actividad nueva sin feedback | "¿Cómo te fue en [actividad]?" (si no hay mensaje previo) | |
| "Ese entreno fue error de GPS" / "Fue en bici" | `update_activity_notes(activity_id, user_notes)` | Corrección manual |

### 1.3 Preferencias y registro del coach
| Petición | Acción | Notas |
|----------|--------|--------|
| "Recuerda que [X]" / "Ten en cuenta que..." | `add_preference_or_rule(text)` | Append a registro |
| "No vuelvas a [Y]" / "No me preguntes..." | `add_preference_or_rule(text)` | Idem |
| "¿Qué tienes guardado sobre mí?" | `get_my_stored_info_summary()` | Listar preferencias + resumen plan + últimas actividades (sin borrar) |
| "Elimina todo lo que sabes de mí" | `delete_all_my_data()` | Confirmación obligatoria (ej. "Responde SÍ") |
| "Borra solo la planificación" | `reset_planning()` | |
| "Borra solo mis preferencias" | `clear_preferences()` | Con confirmación opcional |

### 1.4 Saludos y conversación
| Petición | Acción | Notas |
|----------|--------|--------|
| "Buenos días" / "Dime buenos días" | Respuesta de texto (saludo + opcional resumen del día) | Puede usar `get_today_plan()` para "Hoy tienes..." |
| "¿Qué debería hacer hoy?" | `get_today_plan()` + respuesta | |
| Preguntas sobre método noruego / fisiología / libros | RAG (buscar en base conocimiento) + respuesta | Sin tool; solo contexto inyectado |
| Conversación libre | Respuesta de texto con personalidad de entrenadora | |
| "Dame un tip para mejorar" | Puede buscar en conocimiento o dar consejo; opcional `log_coach_tip(tip)` | |

### 1.5 Resúmenes y estado
| Petición | Acción | Notas |
|----------|--------|--------|
| "Resumen de mi semana" / "¿Cómo va mi entrenamiento?" | `get_week_summary()` o `get_training_summary(period)` | Actividades + plan cumplido |
| "Resumen del mes" | `get_training_summary(period="month")` | |
| "¿Cuántos km llevo esta semana?" | Incluido en resumen o tool `get_weekly_totals()` | |

### 1.6 Configuración y errores
| Petición | Acción | Notas |
|----------|--------|--------|
| Cambiar zona horaria | `set_timezone(tz)` | Para cron y saludos |
| "No me preguntes por entrenos de menos de 30 min" | `add_preference_or_rule(...)` | |
| "Solo pregúntame cómo me fui en rodajes largos" | Idem | |

---

## 2. Fases de implementación

### Fase 1 – Base (días 1–3)
- [x] Proyecto: Node/Express, estructura en `src/`, config con dotenv.
- [x] BD: SQLite con tablas en `src/db.js`: users, messages, planning_periods, planning_weeks, user_preferences, strava_*.
- [x] Cliente Anthropic: llamada a Claude con historial en `src/llm/agent.js`.
- [x] Tools en `src/tools/registry.js` y handlers en `src/tools/handlers.js`.
- [x] Webhook WhatsApp: POST `/webhook/whatsapp` (Twilio), guardar mensaje → Claude con tools → enviar respuesta.
- [x] Flujo: "hola" → respuesta; "envíame el plan los martes" → tool → confirmación.

### Fase 2 – Planificación (días 4–5)
- [ ] CRUD planificación: crear periodo, semanas (texto o JSON por semana).
- [ ] Tool `get_current_plan_week()`, `send_plan_now()`, `reset_planning()`, `change_plan_delivery_day()`, `pause_plan_delivery()`, `resume_plan_delivery()`.
- [ ] Cron/scheduler: cada lunes (o día configurado) a la hora configurada → si hay plan activo, enviar plan de la semana por WhatsApp; si no hay o se acabó, generar nuevo periodo (llamada a Claude con contexto método noruego) y enviar primera semana.
- [ ] Duración del periodo: config (ej. 20 semanas); guardar en planning_period.

### Fase 3 – Strava (días 6–7)
- [ ] OAuth Strava: redirect_uri, guardar access/refresh token por usuario.
- [ ] Strava client: listar actividades recientes, obtener detalle; sincronizar a tabla strava_activity.
- [ ] Tool `get_strava_connect_url()`, `disconnect_strava()`, `sync_strava_activities()`, `update_activity_notes()`.
- [ ] Job periódico (ej. cada 1–2 h): sincronizar actividades nuevas; para cada nueva, si “raro” (reglas simples: duración 0, ritmo imposible, etc.) → encolar mensaje “¿Qué pasó con [actividad]?”; si no raro y sin feedback → “¿Cómo te fue?”. Enviar por WhatsApp.
- [ ] Al responder el usuario, parsear y guardar feedback en strava_activity o tabla de feedback; en siguiente turno no repetir pregunta.

### Fase 4 – Preferencias, registro y borrado (día 8)
- [ ] Tabla user_preference (o coach_registry): texto, tipo (preference | rule | feedback_about_activity).
- [ ] Tools: `add_preference_or_rule()`, `get_my_stored_info_summary()`, `delete_all_my_data()` (con confirmación en flujo), `clear_preferences()`.
- [ ] En el prompt del sistema: inyectar últimas preferencias/reglas para que la IA las respete.
- [ ] Confirmación para delete_all: guardar estado “pending_delete” en user; si siguiente mensaje es “SÍ”/“SI” → ejecutar borrado.

### Fase 5 – RAG y conocimiento (días 9–10)
- [ ] Cargar documentos (método noruego, libros, resúmenes) en un índice (pgvector, Chroma o embeddings en SQLite con vector).
- [ ] Antes de responder: si la pregunta es conceptual, buscar en RAG e inyectar fragmentos en el prompt.
- [ ] Opcional: tool `search_knowledge(query)` para que la IA decida cuándo buscar.

### Fase 6 – Afinación (días 11–12)
- [ ] Heartbeat: job cada 30 min que revise actividades nuevas y envíe preguntas si aplica (ya cubierto en Fase 3 con job periódico).
- [ ] Log de “trabajo del coach”: qué envió, qué preguntó; opcional tabla para analytics.
- [ ] Tips: en system prompt indicar que puede ofrecer un tip cuando sea relevante; opcional `log_coach_tip()`.
- [ ] Despliegue EC2: systemd o supervisor para FastAPI + scheduler; Nginx + SSL para webhook; variables de entorno para secrets.

---

## 3. Stack técnico

- **Backend**: Node.js 18+, Express.
- **BD**: SQLite con better-sqlite3 (tablas en `src/db.js`).
- **LLM**: Anthropic SDK para JavaScript con tool use (function calling).
- **WhatsApp**: Twilio API (webhook HTTPS).
- **Scheduler**: node-cron dentro del proceso (envío semanal del plan).
- **RAG (Fase 5)**: opcional; documentos en `data/knowledge/`.

---

## 4. Variables de entorno

- `ANTHROPIC_API_KEY`
- `WHATSAPP_*` (Twilio: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_NUMBER`; o Meta)
- `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `STRAVA_REDIRECT_URI`
- `DATABASE_URL` (opcional; por defecto SQLite)
- `BASE_URL` (para webhooks y redirects)
- `USER_PHONE` (ej. +56987507237) para enviar mensajes y validar remitente si quieres un solo usuario.

---

## 5. Orden sugerido para mañana

1. Leer este plan y abrir el repo con el código base generado.
2. Configurar `.env` con API keys (Anthropic, WhatsApp, Strava cuando llegues a esa fase).
3. Ejecutar `pip install -r requirements.txt` y `uvicorn app.main:app --reload`.
4. Probar el webhook con un mensaje de prueba (Postman o Twilio sandbox).
5. Seguir Fase 1 y 2 en orden; probar cada tool por WhatsApp antes de seguir.
