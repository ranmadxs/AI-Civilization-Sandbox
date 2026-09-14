import type { NationTurnContext, NationTurnExecutor } from "./turnSimulation";
import type { NationModelConfig, NationModelConfigs } from "./modelConfig";

const LLM_TIMEOUT = 120_000;
const RETRY_DELAY_MS = 2000;
const MAX_RETRIES = 3;

export type LLMProvider = "ollama" | "openrouter" | "google" | "nvidia";

const PROVIDER_BASE_URL: Record<LLMProvider, string> = {
  ollama: "http://localhost:11434/v1",
  openrouter: "https://openrouter.ai/api/v1",
  google: "https://generativelanguage.googleapis.com/v1beta/openai",
  nvidia: "https://integrate.api.nvidia.com/v1",
};

export const DEFAULT_PROVIDER = "openrouter";
export const DEFAULT_MODEL = "inclusionai/ling-3.0-flash-sante:free";

export type LLMDecision = {
  expansion: string;
  economy: string;
  diplomacy: string;
  targetNationId?: string;
  targetTileId?: string;
  rationale?: string;
};

const decisionMap = new Map<string, LLMDecision>();

export function getDecisionLog(): Map<string, LLMDecision> {
  return decisionMap;
}

export function createLLMExecutor(configs: NationModelConfigs): NationTurnExecutor {
  return async function llmExecutor(context: NationTurnContext): Promise<void> {
    const config = configs[context.nationId];
    if (!config?.enabled) return;

    const baseUrl = config.endpoint || PROVIDER_BASE_URL[config.providerName as LLMProvider] || PROVIDER_BASE_URL.ollama;
    const model = config.model || "qwen3:14B";

    console.log("LLM Call debug:", { baseUrl, model, provider: config.providerName });

    const prompt = buildPrompt(context, config);

    for (let attempt = 1; attempt <= MAX_RETRIES * 2; attempt += 1) {
      try {
        const forceJsonOnly = attempt > 1;
        const response = await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(config.apiKey.trim() 
              ? { "Authorization": `Bearer ${config.apiKey.trim()}` } 
              : {}),
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: forceJsonOnly
                ? `${config.personalityPrompt}\nReturn ONLY valid JSON. No text, no reasoning, no explanation.`
                : `${config.personalityPrompt}\nRespond ONLY with valid JSON, no explanation.`
              },
              { role: "user", content: forceJsonOnly
                ? `Return ONLY this JSON format with values. Nothing else:\n{"expansion":"none","economy":"construction","diplomacy":"none","targetNationId":null,"rationale":"brief"}`
                : prompt
              },
            ],
            max_tokens: 1024,
            temperature: 0.7,
          }),
          signal: AbortSignal.timeout(LLM_TIMEOUT),
        });

        if (response.status === 429) {
          const waitMs = RETRY_DELAY_MS * attempt;
          await new Promise((r) => setTimeout(r, waitMs));
          continue;
        }
        if (!response.ok) {
          throw new Error(`LLM request failed: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content ?? "";
        const reasoning = data.choices?.[0]?.message?.reasoning ?? "";
        const fullText = reasoning + content;
        if (!fullText.trim()) throw new Error("Empty response from LLM");
        const decision = parseDecision(fullText);
        if (!decision) continue;
        const target = validateTarget(decision, context);
        if (target) { decision.targetNationId = target; }
        decisionMap.set(`${context.nationId}_turn_${context.turnNumber}`, decision);
        applyDecisionToWorld(decision, context);
        console.log(`[${context.nationId}] Turn ${context.turnNumber}: expansion=${decision.expansion}, economy=${decision.economy}, diplomacy=${decision.diplomacy}, target=${decision.targetNationId ?? "null"}, rationale="${decision.rationale ?? ""}"`);
        return;
      } catch (error) {
        if (attempt === MAX_RETRIES * 2) throw error;
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempt));
      }
    }
  };
}

function validateTarget(decision: LLMDecision, context: NationTurnContext): string | null {
  const validTargets = context.world.nations
    .filter((n) => n.id !== context.nationId)
    .map((n) => n.id);
  if (decision.targetNationId && validTargets.includes(decision.targetNationId)) {
    return decision.targetNationId;
  }
  const weakest = validTargets
    .map((id) => ({ id, pop: (context.world.cities.filter((c) => c.nationId === id).reduce((s, c) => s + c.population, 0)) }))
    .sort((a, b) => a.pop - b.pop);
  return weakest[0]?.id ?? null;
}

function buildPrompt(context: NationTurnContext, config: NationModelConfig): string {
  const nation = context.world.nationById.get(context.nationId);
  const stockpile = context.simulation.nationStockpiles[context.nationId];
  const policy = context.simulation.nationPolicies[context.nationId];
  const cities = context.world.cities.filter((c) => c.nationId === context.nationId);
  const provinces = context.world.provinces.filter((p) => p.nationId === context.nationId);
  const nationPopulation = cities.reduce((s, c) => s + c.population, 0);

    const enemyNations = context.world.nations
    .filter((n) => n.id !== context.nationId)
    .map((n) => {
      const nCities = context.world.cities.filter((c) => c.nationId === n.id);
      const nPop = nCities.reduce((s, c) => s + c.population, 0);
      return `${n.name} (id=${n.id}, pop=${nPop.toLocaleString()}, cities=${nCities.length}, provinces=${context.world.provinces.filter(p => p.nationId === n.id).length})`;
    })
    .join("\n    ");

  const allNationIds = context.world.nations.map((n) => `${n.id}="${n.name}"`).join(", ");

  return [
    `You are the national decision maker of ${nation?.name ?? context.nationId} (id=${context.nationId}).`,
    `Turn: ${context.turnNumber}`,
    `Your status: Population=${nationPopulation.toLocaleString()} | Cities=${cities.length} | Provinces=${provinces.length} | Gold=${Math.round(stockpile?.gold ?? 0)}`,
    ``,
    `All nation IDs: ${allNationIds}`,
    ``,
    `Other nations:` + (enemyNations ? "\n    " + enemyNations : " none"),
    ``,
    `DECISION GUIDE — what each option does:`,
    `  expansion:"control_city" + targetNationId: ATTACK that nation and CAPTURE one of its cities.`,
    `    You steal the city, its population, and its resources. Use this to grow when you are weak.`,
    `  expansion:"control_resource" + targetNationId: Seize resource tiles from that nation.`,
    `  expansion:"decisive_battle" + targetNationId: Launch a full-scale invasion.`,
    `  expansion:"declare_war" + targetNationId: Start a war against that nation.`,
    `  expansion:"peaceful_expand" + targetNationId: Expand peacefully by paying gold and population. No war needed.`,
    `  expansion:"none": Do not expand militarily this turn.`,
    ``,
    `  economy:"army_building": Build military units (needed before attacking).`,
    `  economy:"construction": Build infrastructure to grow population and economy.`,
    `  economy:"recovery": Conserve resources to recover population and stability.`,
    ``,
    `  diplomacy:"declare_war" + targetNationId: Formally declare war (allows attacking).`,
    `  diplomacy:"seek_alliance" + targetNationId: Form a military alliance.`,
    `  diplomacy:"seek_peace" + targetNationId: Negotiate a truce with a hostile nation.`,
    `  diplomacy:"none": No diplomatic action this turn.`,
    ``,
    `WARNING: targetNationId MUST be one of the Other nations IDs above (NOT your own id="${context.nationId}").`,
    `If you have low population (0-2000), you should use control_city to capture an enemy city and steal its population. Declare war first, then control_city to attack.`,
    ``,
    `Current policies: Expansion=${policy?.expansion?.policy ?? "unknown"}, Economy=${policy?.economy?.policy ?? "unknown"}, Diplomacy=${policy?.diplomacy?.policy ?? "unknown"}`,
    ``,
    "Respond ONLY with valid JSON, no explanation, no analysis, no reasoning text:",
    '{"expansion":"declare_war"|"control_city"|"control_resource"|"decisive_battle"|"none","economy":"army_building"|"construction"|"recovery","diplomacy":"declare_war"|"seek_alliance"|"seek_peace"|"none","targetNationId":"nation_id","rationale":"brief reason"}',
  ].join("\n");
}

function parseDecision(raw: string): LLMDecision | null {
  const cleaned = raw.replace(/```json\s*/g, "").replace(/```/g, "");
  const jsonStart = cleaned.indexOf("{");
  if (jsonStart === -1) {
    const fallback = cleaned.match(/\{[\s\S]*\}/);
    if (fallback) {
      try {
        const parsed = JSON.parse(fallback[0]);
        return {
          expansion: parsed.expansion ?? "none",
      targetTileId: parsed.targetTileId,
          economy: parsed.economy ?? "construction",
          diplomacy: parsed.diplomacy ?? "none",
          targetNationId: parsed.targetNationId ?? null,
          rationale: parsed.rationale ?? "",
        };
      } catch {}
    }
    return null;
  }
  const jsonStr = cleaned.substring(jsonStart);
  try {
    const parsed = JSON.parse(jsonStr);
    return {
      expansion: parsed.expansion ?? "none",
      targetTileId: parsed.targetTileId,
      economy: parsed.economy ?? "construction",
      diplomacy: parsed.diplomacy ?? "none",
      targetNationId: parsed.targetNationId ?? null,
      rationale: parsed.rationale ?? "",
    };
  } catch {
    const extract = (key: string): string | null => {
      const m = jsonStr.match(new RegExp(`"${key}"\\s*:\\s*"([^"]*)"`));
      return m ? m[1] : null;
    };
    const numExtract = (key: string): string | null => {
      const m = jsonStr.match(new RegExp(`"${key}"\\s*:\\s*(\\d+)`));
      return m ? m[1] : null;
    };
    const expansion = extract("expansion") ?? "none";
    const economy = extract("economy") ?? "construction";
    const diplomacy = extract("diplomacy") ?? "none";
    const targetNationId = extract("targetNationId") ?? undefined;
    const rationale = extract("rationale") ?? "";
    return { expansion, economy, diplomacy, targetNationId, rationale };
  }
}

function applyDecisionToWorld(decision: LLMDecision, context: NationTurnContext): void {
  const nation = context.world.nationById.get(context.nationId);
  if (!nation) return;

  const sim = context.simulation as any;
  const nationPolicies = sim.nationPolicies[context.nationId] || {};

  if (decision.expansion && decision.expansion !== "none") {
    const expansionPolicy = decision.expansion === "control_city" ? "control_city" : decision.expansion;
    nationPolicies.expansion = {
      policy: expansionPolicy as any,
      label: expansionPolicy,
      rationale: decision.rationale || "",
      targetNationId: decision.targetNationId || undefined,
      targetTileId: decision.targetTileId || undefined,
      targetResource: decision.expansion === "control_resource" ? "grain" : undefined,
      decidedAtMonth: context.turnNumber,
      nextDecisionMonth: context.turnNumber + 2,
    };
  } else if (decision.expansion) {
    nationPolicies.expansion = { ...nationPolicies.expansion, decidedAtMonth: context.turnNumber, nextDecisionMonth: context.turnNumber + 2 };
  }

  if (decision.economy && decision.economy !== "none") {
    nationPolicies.economy = {
      policy: decision.economy as any,
      label: decision.economy,
      rationale: decision.rationale || "",
      decidedAtMonth: context.turnNumber,
      nextDecisionMonth: context.turnNumber + 2,
    };
  } else if (decision.economy) {
    nationPolicies.economy = { ...nationPolicies.economy, decidedAtMonth: context.turnNumber, nextDecisionMonth: context.turnNumber + 2 };
  }

  if (decision.diplomacy && decision.diplomacy !== "none") {
    nationPolicies.diplomacy = {
      policy: decision.diplomacy as any,
      label: decision.diplomacy,
      rationale: decision.rationale || "",
      targetNationId: decision.targetNationId || undefined,
      targetTileId: decision.targetTileId || undefined,
      decidedAtMonth: context.turnNumber,
      nextDecisionMonth: context.turnNumber + 2,
    };
  } else if (decision.diplomacy) {
    nationPolicies.diplomacy = { ...nationPolicies.diplomacy, decidedAtMonth: context.turnNumber, nextDecisionMonth: context.turnNumber + 2 };
  }

  nationPolicies.decidedAtMonth = context.turnNumber;
  nationPolicies.nextDecisionMonth = context.turnNumber + 2;

  if (decision.targetNationId && (decision.diplomacy === "declare_war" || decision.expansion === "decisive_battle")) {
    sim.events.push({
      kind: "war_declared",
      month: context.turnNumber,
      nationIds: [context.nationId, decision.targetNationId],
      type: "war_declared",
    } as any);
  }

  sim.nationPolicies[context.nationId] = nationPolicies;
}
