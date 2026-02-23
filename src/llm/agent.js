import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";
import { getToolsDefinitions, runTool } from "../tools/registry.js";
import { searchKnowledge } from "../rag/search.js";

const SYSTEM_PROMPT = `Eres una entrenadora personal por WhatsApp. Sigues el método noruego de entrenamiento.
Tu tono es cercano pero profesional. Respuestas breves (WhatsApp).

Reglas importantes:
- Si el usuario pide "elimina todo lo que sabes de mí" o similar, NO llames a delete_all_my_data hasta que confirme explícitamente (por ejemplo diciendo SÍ). Primero responde pidiendo confirmación.
- Si en mensajes recientes el usuario ya dijo cómo le fue en un entreno, no vuelvas a preguntar; comenta sobre ese feedback.
- Usa las herramientas cuando el usuario pida algo que requiera cambiar datos, enviar el plan, ver estado, etc.
- Para saludos ("buenos días", "hola") responde con calidez; si tiene plan para hoy puedes usar get_today_plan para decirle qué toca.
- Para preguntas sobre método noruego o fisiología responde con lo que sepas.
- Si el usuario pide "genera nueva planificación" o "empezar de cero" con la planificación, puedes usar reset_planning y luego generate_new_planning (o solo generate_new_planning si quieres mantener historial). generate_new_planning crea un nuevo bloque de semanas y lo guarda.
`;

function buildMessages(history, newContent) {
  const messages = [];
  for (const h of history) {
    const role = h.role === "user" ? "user" : "assistant";
    if (h.content) messages.push({ role, content: h.content });
  }
  if (newContent) messages.push({ role: "user", content: newContent });
  return messages;
}

export async function chatWithTools(userId, db, history, newMessage) {
  const client = new Anthropic({ apiKey: config.anthropic.apiKey });
  const tools = getToolsDefinitions();
  let messages = buildMessages(history, newMessage);
  const maxRounds = 5;
  let lastText = "";

  let systemPrompt = SYSTEM_PROMPT;
  try {
    const ragContext = await searchKnowledge(newMessage, { limit: 5 });
    if (ragContext) systemPrompt = SYSTEM_PROMPT + "\n\n" + ragContext;
  } catch {
    // RAG opcional: si falla, seguimos sin contexto
  }

  for (let round = 0; round < maxRounds; round++) {
    const response = await client.messages.create({
      model: config.anthropic.model,
      max_tokens: 1024,
      system: systemPrompt,
      tools,
      messages,
    });

    const textParts = [];
    const toolUses = [];

    for (const block of response.content) {
      if (block.type === "text") textParts.push(block.text);
      if (block.type === "tool_use") {
        toolUses.push({
          id: block.id,
          name: block.name,
          input: block.input || {},
        });
      }
    }

    lastText = textParts.join("").trim();

    if (toolUses.length === 0) {
      return lastText || "Listo.";
    }

    // Append assistant message (text + tool_use)
    const assistantContent = [];
    if (textParts.length) assistantContent.push({ type: "text", text: textParts.join("") });
    for (const tu of toolUses) {
      assistantContent.push({ type: "tool_use", id: tu.id, name: tu.name, input: tu.input });
    }
    messages.push({ role: "assistant", content: assistantContent });

    // Run tools and append results
    const toolResults = await Promise.all(
      toolUses.map(async (tu) => ({
        type: "tool_result",
        tool_use_id: tu.id,
        content: await runTool(tu.name, tu.input, userId, db),
      }))
    );
    messages.push({ role: "user", content: toolResults });
  }

  return lastText || "Listo.";
}
