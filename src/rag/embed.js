import { config } from "../config.js";

/**
 * Obtiene el vector de embedding para un texto usando OpenAI.
 * @param {string} text
 * @returns {Promise<number[] | null>}
 */
export async function embedText(text) {
  const key = config.openai?.apiKey;
  if (!key || !text?.trim()) return null;
  try {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: config.openai?.embeddingModel || "text-embedding-3-small",
        input: text.slice(0, 8000),
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const vec = data?.data?.[0]?.embedding;
    return Array.isArray(vec) ? vec : null;
  } catch {
    return null;
  }
}

/**
 * Similitud coseno entre dos vectores.
 */
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
