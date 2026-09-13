// LLM test model script – uses shared loggerBase for config and logging
import { LLM_PROVIDER, LLM_MODEL, LLM_API_KEY, LLM_ENABLED, PROVIDER_ENDPOINTS } from "./llmConfig.mjs";
import { createServer } from "vite";
import { initLog, logLine } from "./loggerBase.mjs";
import { mkdirSync } from "node:fs"; // still need mkdirSync for early dir creation maybe

console.log("Config de prueba:", { LLM_PROVIDER, LLM_MODEL, hasKey: LLM_API_KEY.length > 0 });

const server = await createServer({
  appType: "custom",
  configFile: undefined,
  logLevel: "error",
  server: { middlewareMode: true },
  root: "src",
});

const buildDemoWorld = (await server.ssrLoadModule("/world/buildDemoWorld.ts")).buildDemoWorld;
const { createInitialSimulationState, advanceSimulationTurn } = await server.ssrLoadModule("/world/turnSimulation.ts");
const { createLLMExecutor, getDecisionLog } = await server.ssrLoadModule("/world/llmExecutor.ts");
const { buildDefaultNationModelConfigs } = await server.ssrLoadModule("/world/modelConfig.ts");

const world = buildDemoWorld("test-model", { nationCount: 4 });
const simulation = createInitialSimulationState(world);
const defaultConfigs = buildDefaultNationModelConfigs(world);
const LLM_NATION_ID = world.nations[0].id;

const llmConfigs = {};
for (const [nationId, config] of Object.entries(defaultConfigs)) {
  llmConfigs[nationId] = {
    ...config,
    enabled: nationId === LLM_NATION_ID,
    model: LLM_MODEL,
    providerName: LLM_PROVIDER,
    apiKey: LLM_API_KEY,
    endpoint: PROVIDER_ENDPOINTS[LLM_PROVIDER] || config.endpoint,
  };
}

const llmExecutor = LLM_ENABLED ? createLLMExecutor(llmConfigs) : async () => {};

// Initialize log with a name specific to this test
const logPath = initLog("test_model");

// ── ahora sí, el resto del script ────────────────────────────────────────

let sim = simulation;
const questions = [
  { name: "1/5 Fácil: Reclutamiento inicial", difficulty: "Fácil" },
  { name: "2/5 Fácil: Expansión territorial suave", difficulty: "Fácil" },
  { name: "3/5 Media: Diplomacia con vecino", difficulty: "Media" },
  { name: "4/5 Difícil: Guerra y suministro", difficulty: "Difícil" },
  { name: "5/5 Difícil: Decisión estratégica compleja", difficulty: "Difícil" },
];

logLine(logPath, `=== Test Model: ${LLM_MODEL} ===`);
logLine(logPath, `API Key: ${LLM_ENABLED ? "Configurado ✓" : "Faltante ✗"}`);
logLine(logPath, `Nación LLM: ${LLM_NATION_ID}`);
logLine(logPath, "");

for (let q = 0; q < 5; q++) {
  const qInfo = questions[q];
  const turnNumber = sim.elapsedMonths + 1;
  const nation = world.nations[q % world.nations.length];

  console.log(`Ejecutando ${qInfo.name} (País: ${nation.name})...`);
  logLine(logPath, `--- ${qInfo.name} ---`);
  logLine(logPath, `Turno: ${turnNumber} | País: ${nation.name} | Dificultad: ${qInfo.difficulty}`);

  const beforeKeys = new Set(getDecisionLog().keys());

  try {
    const next = await (LLM_ENABLED ? advanceSimulationTurn(world, sim, llmExecutor) : advanceSimulationTurn(world, sim, async () => {}));
    sim = next;
    console.log(`Turno ${q + 1}/5 completado con éxito.`);

    const newKeys = [...getDecisionLog().keys()].filter((k) => !beforeKeys.has(k));
    if (newKeys.length > 0) {
      for (const key of newKeys) {
        const decision = getDecisionLog().get(key);
        if (decision) {
          logLine(logPath, `  → ${key}: expansion=${decision.expansion}, economy=${decision.economy}, diplomacy=${decision.diplomacy}, target=${decision.targetNationId ?? "null"}`);
          logLine(logPath, `    Rationale: "${decision.rationale ?? ""}"`);
        }
      }
    } else {
      logLine(logPath, "  → Sin decisión LLM este turno");
    }

    const stockpile = sim.nationStockpiles[nation.id];
    logLine(logPath, `  → Gold: ${Math.round(stockpile?.gold ?? 0)} | Pop: ${world.cities.filter((c) => c.nationId === nation.id).reduce((s, c) => s + c.population, 0).toLocaleString()}`);
    logLine(logPath, "");
  } catch (error) {
    console.error("ERROR EN TURNO:", error);
    logLine(logPath, `  → ERROR: ${error.message}`);
    logLine(logPath, "");
  }
}

logLine(logPath, "--- Resumen ---");
logLine(logPath, `Decisiones LLM registradas: ${getDecisionLog().size}`);
logLine(logPath, `Simulación: ${sim.elapsedMonths} meses`);

console.log(`Log guardado: ${logPath}`);
console.log(`LLM habilitado: ${LLM_ENABLED}`);

await server.close();