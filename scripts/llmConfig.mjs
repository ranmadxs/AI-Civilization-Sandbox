// LLM configuration from .env (with override)
// Also provides PROVIDER_ENDPOINTS for dynamic provider switching

import dotenv from "dotenv";
dotenv.config({ override: true });
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const LLM_PROVIDER = process.env.LLM_PROVIDER || "nvidia";
export const LLM_MODEL = process.env.LLM_MODEL || "nvidia/nemotron-3-ultra-550b-a55b";
export const LLM_API_KEY = process.env.LLM_API_KEY || "";
export const LLM_ENABLED = LLM_API_KEY.trim().length > 0 || LLM_PROVIDER === "ollama";

// Provider endpoints map – change this when adding new providers
export const PROVIDER_ENDPOINTS = {
  nvidia: "https://integrate.api.nvidia.com/v1",
  openrouter: "https://openrouter.ai/api/v1",
  google: "https://generativelanguage.googleapis.com/v1beta/openai",
  ollama: "http://localhost:11434/v1",
};