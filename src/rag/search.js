import { db } from "../db.js";
import { config } from "../config.js";
import { embedText } from "./embed.js";

/**
 * Busca los fragmentos más relevantes para una consulta (RAG).
 * Usa embeddings en SQLite + similitud coseno.
 * @param {string} query - Pregunta o tema a buscar
 * @param {{ limit?: number }} opts - limit (default 5)
 * @returns {Promise<string>} - Texto con los fragmentos para inyectar en el prompt
 */
export async function searchKnowledge(query, opts = {}) {
  const limit = opts.limit ?? 5;
  if (!config.openai?.apiKey) return "";

  const queryEmbedding = await embedText(query);
  if (!queryEmbedding) return "";

  const rows = db.prepare("SELECT id, source, text, embedding_json FROM knowledge_chunks").all();
  if (!rows.length) return "";

  const scored = rows.map((row) => {
    let vec;
    try {
      vec = JSON.parse(row.embedding_json);
    } catch {
      return { ...row, score: 0 };
    }
    const score = cosineSimilarity(queryEmbedding, vec);
    return { ...row, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, limit).filter((r) => r.score > 0.1);
  if (!top.length) return "";

  const parts = top.map((r) => `[${r.source}]\n${r.text}`).join("\n\n---\n\n");
  return `Contexto de la base de conocimiento (usa solo si es relevante para responder):\n\n${parts}`;
}

function cosineSimilarity(a, b) {
  if (a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const den = Math.sqrt(na) * Math.sqrt(nb);
  return den === 0 ? 0 : dot / den;
}
