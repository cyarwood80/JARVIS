import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const ROOT_DIR = path.resolve(__dirname, '..');

export const PORT = process.env.PORT || 3000;
export const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
export const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

export const COLD_THRESHOLD_MS = 5 * 60 * 1000;
export const LARGE_MODELS = new Set(['qwen2.5:32b', 'gemma4:26b']);

export const modelWarmth = {};
export const METRICS = {
    totalTokensLocal: 0,
    totalTokensPublic: 0,
    models: {}
};
export let MODEL_REGISTRY = {};

export function setModelRegistry(registry) {
    MODEL_REGISTRY = registry;
}

export function isModelCold(modelName) {
    const last = modelWarmth[modelName] || 0;
    return (Date.now() - last) > COLD_THRESHOLD_MS;
}

export function markModelWarm(modelName) {
    modelWarmth[modelName] = Date.now();
    console.log(`[WARMTH] Marked ${modelName} as warm.`);
}
