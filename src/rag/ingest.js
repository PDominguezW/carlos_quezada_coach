import { db } from "../db.js";
import { embedText } from "./embed.js";

const CHUNK_SIZE = 800;
const CHUNK_OVERLAP = 100;

/**
 * Parte un texto en trozos con solapamiento.
 */
function chunkText(text) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + CHUNK_SIZE, text.length);
    if (end < text.length) {
      const nextSpace = text.indexOf(" ", end);
      if (nextSpace !== -1) end = nextSpace + 1;
    }
    const slice = text.slice(start, end).trim();
    if (slice) chunks.push(slice);
    start = end - CHUNK_OVERLAP;
    if (start >= text.length) break;
  }
  return chunks;
}

/**
 * Añade documentos a la base de conocimiento (genera embeddings y guarda).
 * @param {{ source: string, text: string }[]} documents - Lista de { source, text }
 * @returns {Promise<{ inserted: number, errors: number }>}
 */
export async function ingestDocuments(documents) {
  let inserted = 0;
  let errors = 0;
  const insert = db.prepare(
    "INSERT INTO knowledge_chunks (source, text, embedding_json) VALUES (?, ?, ?)"
  );

  for (const doc of documents) {
    const chunks = chunkText(doc.text);
    for (const text of chunks) {
      const embedding = await embedText(text);
      if (!embedding) {
        errors++;
        continue;
      }
      insert.run(doc.source, text, JSON.stringify(embedding));
      inserted++;
    }
  }

  return { inserted, errors };
}

/**
 * Borra todo el conocimiento de una fuente (o todo si source es null).
 */
export function clearKnowledge(source = null) {
  if (source) {
    return db.prepare("DELETE FROM knowledge_chunks WHERE source = ?").run(source);
  }
  return db.prepare("DELETE FROM knowledge_chunks").run();
}
