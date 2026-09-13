// Base logger and LLM config for AI Civilization Sandbox scripts
// Carga .env y provee LLM_PROVIDER, LLM_MODEL, LLM_API_KEY, LLM_ENABLED
// También inicializa la carpeta de logs y exporta una función de logging.

import { LLM_PROVIDER, LLM_MODEL, LLM_API_KEY, LLM_ENABLED } from "./llmConfig.mjs";
import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";

// Logging setup – each script defines its own file name prefix
export function initLog(logFileName) {
  const dateStr = new Date().toISOString().slice(0, 10);
  const logDir = join(process.cwd(), "target", "logs");
  mkdirSync(logDir, { recursive: true });
  const logPath = join(logDir, `${logFileName}_${dateStr}.log`);
  // Write header immediately
  const header = [
    `=== ${logFileName} ===`,
    `API Key: ${LLM_ENABLED ? "Configurado ✓" : "Faltante ✗"}`,
    `Modelo: ${LLM_MODEL}`,
    `Proveedor: ${LLM_PROVIDER}`,
    "",
  ].join("\n");
  writeFileSync(logPath, header, { flag: "w" });
  return logPath;
}

// Convenience to append a line (sync, fast)
export function logLine(logPath, line) {
  appendFileSync(logPath, line + "\n");
}

// Include reasoning effort note (for reference)
/* reasoning effort: efficient */