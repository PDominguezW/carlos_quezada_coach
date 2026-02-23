#!/usr/bin/env node
import "dotenv/config";
/**
 * Añade un documento a la base de conocimiento (RAG).
 * Uso: node scripts/ingest-knowledge.js <archivo.txt> <nombre_fuente>
 * Ejemplo: node scripts/ingest-knowledge.js ./data/metodo-noruego.txt metodo_noruego
 */
import { readFileSync } from "fs";
import { ingestDocuments } from "../src/rag/ingest.js";

const file = process.argv[2];
const source = process.argv[3] || "documento";

if (!file) {
  console.error("Uso: node scripts/ingest-knowledge.js <archivo.txt> <nombre_fuente>");
  process.exit(1);
}

let text;
try {
  text = readFileSync(file, "utf-8");
} catch (e) {
  console.error("No se pudo leer el archivo:", e.message);
  process.exit(1);
}

const result = await ingestDocuments([{ source, text }]);
console.log(`Insertados: ${result.inserted}, errores: ${result.errors}`);
process.exit(result.errors > 0 ? 1 : 0);
