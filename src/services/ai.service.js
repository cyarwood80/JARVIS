import { GoogleGenerativeAI } from '@google/generative-ai';
import { GEMINI_API_KEY, OLLAMA_URL, METRICS, MODEL_REGISTRY, setModelRegistry, markModelWarm, AGENT_NAME, ROOT_DIR } from '../config.js';
import { activeWindowContext, clipboardContext } from './system.service.js';
import { getCoreMemory } from './memory.service.js';
import { systemHardwareProfile } from './hardware.service.js';
import fsSync from 'fs';
import path from 'path';

const KNOWN_CAPABILITIES = {
    'hermes3': { domain: 'general', specialisms: 'OS commands, system queries, user/session info, event logs, file operations, network info', toolCalling: 'reliable' },
    'qwen2.5': { domain: 'coding', specialisms: 'Code generation, scripts, debugging, programming tasks, data transformation', toolCalling: 'very reliable' },
    'gemma4': { domain: 'reasoning', specialisms: 'Complex multi-step reasoning, data analysis, long-form content, research tasks', toolCalling: 'native best' },
    'llama3.1': { domain: 'general', specialisms: 'Simple factual Q&A, general conversation, quick answers with no tool required', toolCalling: 'limited' },
    'llama3': { domain: 'general', specialisms: 'Summarisation, condensing long tool outputs, instruction following', toolCalling: 'limited' }
};

const getPlannerPrompt = () => `You are ${AGENT_NAME}'s planning brain running on a Windows 11 PC. Your ONLY job is to analyse the user's intent and output a precise JSON execution plan.

Available tools:
  - execute_command(command): Run any PowerShell command on the user's Windows PC
  - open_application(appName): Launch a Windows application
  - get_pc_diagnostics(): Get current CPU, RAM, and Disk usage percentages
  - manage_memory(action, fact): "action" can be "append", "read", "search", "clear".
  - save_script(scriptName, description, code): Save a reusable script. If you save it to the "autonomous" subfolder (e.g. scriptName: "autonomous/check_cpu.ps1"), it will automatically execute in the background every 5 minutes forever. Use this to create efficient local system monitors instead of relying on the LLM.
  - run_saved_script(scriptName, args): Run a saved script.
  - list_scripts(): List saved scripts.
  - search_web(query): Search the live internet.
  - whatsapp_push(message): Send WhatsApp message.
  - voice_alert(message): Speak a text string.
  - desktop_notify(title, message): Pop up a Windows notification.

Output format (strict JSON, nothing else):
{"intent": "<concise description>", "needs_tool": true|false, "tool": "<tool_name or null>", "args": {<tool args or empty object>}, "local_model": "<model_name>"}`;

export async function refreshModels() {
    try {
        const res = await fetch(`${OLLAMA_URL}/api/tags`);
        if (!res.ok) return;
        const data = await res.json();
        const newRegistry = {};
        for (const model of data.models) {
            const name = model.name;
            const sizeGB = (model.size / 1e9).toFixed(1) + 'GB';
            let matchedCaps = { domain: 'general', specialisms: 'General purpose tasks', toolCalling: 'unknown' };
            for (const [key, caps] of Object.entries(KNOWN_CAPABILITIES)) {
                if (name.toLowerCase().includes(key)) {
                    matchedCaps = caps;
                    break;
                }
            }
            newRegistry[name] = { ...matchedCaps, size: sizeGB };
        }
        setModelRegistry(newRegistry);
    } catch (e) {
        console.error('[OLLAMA] Failed to connect to Ollama. Attempting to start the service...');
        import('child_process').then(({ exec }) => {
            exec('ollama serve', (err) => {
                // Ignore errors as it usually means it's already running but warming up
            });
        });
    }
}

// Auto-refresh models every 15 seconds so JARVIS detects models finishing downloads in the background
setInterval(refreshModels, 15000);

function shouldFallbackToLocal(err) {
    const msg = (err?.message || '').toLowerCase();
    return msg.includes('429') || 
           msg.includes('quota') || 
           msg.includes('too many') || 
           msg.includes('503') || 
           msg.includes('500') || 
           msg.includes('fetch') || 
           msg.includes('network') || 
           msg.includes('timeout') ||
           msg.includes('api key');
}

let cachedFleetConfig = null;

function loadFleetConfig() {
    try {
        const p = path.join(ROOT_DIR, 'vault', 'fleet_config.json');
        if (fsSync.existsSync(p)) {
            cachedFleetConfig = JSON.parse(fsSync.readFileSync(p, 'utf8'));
        }
    } catch { }
}

export function getBestLocalModel(requiredCapability) {
    if (!cachedFleetConfig) loadFleetConfig();
    
    // 1. NATIVE ORCHESTRATION ROUTING (Gemini Curated Fleet)
    if (cachedFleetConfig && cachedFleetConfig[requiredCapability]) {
        const exactModel = cachedFleetConfig[requiredCapability];
        // Ensure it hasn't been uninstalled
        if (MODEL_REGISTRY[exactModel]) return exactModel;
    }

    // 2. FALLBACK SCORING LOGIC
    let bestModel = null;
    let maxScore = -1;
    
    // Fallback if registry is empty
    const fallback = Object.keys(MODEL_REGISTRY)[0] || 'llama3.1:8b';
    
    for (const [name, meta] of Object.entries(MODEL_REGISTRY)) {
        let score = 0;
        
        // Base score based on model size (bigger models = vastly higher base score)
        const sizeGB = parseFloat(meta.size) || 0;
        score += (sizeGB * 10); 
        
        // Boost score based on task capability
        if (requiredCapability === 'planner') {
            if (meta.toolCalling === 'very reliable' || meta.toolCalling === 'native best') score += 50;
            if (meta.domain === 'coding') score += 30; 
        } else if (requiredCapability === 'synthesiser' || requiredCapability === 'chat') {
            if (meta.domain === 'reasoning') score += 100;
            if (meta.domain === 'general') score += 20;
        }

        // HARDWARE LIMITER: Prevent Out-Of-Memory crashes
        if (systemHardwareProfile && systemHardwareProfile.ramGB) {
            // Give a 2GB buffer for OS overhead. If model exceeds RAM, nuke its score.
            if (sizeGB > (systemHardwareProfile.ramGB - 2)) {
                score -= 1000;
            }
        }
        
        if (score > maxScore) {
            maxScore = score;
            bestModel = name;
        }
    }
    
    return bestModel || fallback;
}

export async function runLocalModel(modelName, messages, tools = null) {
    const coreMemory = await getCoreMemory(messages);
    const currentTime = `\nThe current system date and time is: ${new Date().toLocaleString()}.\n`;
    const envContext = `The user's currently active window is: ${activeWindowContext}\nThe user's clipboard contains: "${clipboardContext}"\n`;
    const systemPrompt = tools
        ? `You are ${AGENT_NAME}... You MUST call the tool immediately. Execute the tool now.` + currentTime + envContext + coreMemory
        : `You are ${AGENT_NAME}... Answer concisely.` + currentTime + envContext + coreMemory;

    const ollamaMessages = [{ role: "system", content: systemPrompt }, ...messages];
    const body = { model: modelName, messages: ollamaMessages, stream: false, keep_alive: "2h" };
    if (tools) body.tools = tools;

    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });

    if (!res.ok) throw new Error(`Ollama returned status ${res.status}`);
    const data = await res.json();
    
    if (data.eval_count) {
        METRICS.totalTokensLocal += data.eval_count;
        if (!METRICS.models[modelName]) METRICS.models[modelName] = { runs: 0, tokens: 0 };
        METRICS.models[modelName].runs++;
        METRICS.models[modelName].tokens += data.eval_count;
    }
    return data;
}

export async function cloudPlan(messages) {
    if (!GEMINI_API_KEY) throw new Error('No Gemini API key');
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    
    const recentContext = messages.slice(-6).map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n');
    const coreMemory = await getCoreMemory(messages);
    const envContext = `Active window: ${activeWindowContext}\nClipboard: "${clipboardContext}"\n`;
    const plannerPrompt = `${getPlannerPrompt()}${envContext}${coreMemory}\n\nContext:\n${recentContext}\n\nOutput JSON:`;

    const result = await model.generateContent(plannerPrompt);
    if (result.response.usageMetadata) METRICS.totalTokensPublic += result.response.usageMetadata.totalTokenCount;
    
    const raw = result.response.text().trim();
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    return JSON.parse(cleaned);
}

export async function localPlan(messages) {
    const recentContext = messages.slice(-6).map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n');
    const coreMemory = await getCoreMemory(messages);
    const envContext = `Active window: ${activeWindowContext}\nClipboard: "${clipboardContext}"\n`;
    const localPlanPrompt = `${getPlannerPrompt()}${envContext}${coreMemory}\n\nContext:\n${recentContext}\n\nOutput JSON:`;
    
    const bestModel = getBestLocalModel('planner');
    const localData = await runLocalModel(bestModel, [{ role: 'user', content: localPlanPrompt }]);
    const cleaned = (localData.message?.content || '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No valid JSON');

    return JSON.parse(jsonMatch[0]);
}

export async function jarvisPlan(messages, broadcastLog, broadcastStatus) {
    try {
        if (broadcastStatus) broadcastStatus('thinking', '⚡ Request received — Local AI is planning...');
        return await localPlan(messages);
    } catch (localError) {
        broadcastLog('[Local Planner] Failed or unavailable. Falling back to Cloud AI (Gemini)...');
        if (broadcastStatus) broadcastStatus('thinking', '⚡ Request received — Cloud AI (Gemini) is planning...');
        return await cloudPlan(messages);
    }
}

export async function cloudSynthesise(messages, toolName, toolArgs, toolOutput) {
    if (!GEMINI_API_KEY) throw new Error('No API key');
    const userQuestion = messages[messages.length - 1]?.content || "";
    const historyText = messages.slice(-5, -1).map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n');
    const prompt = `Recent Conversation:\n${historyText}\n\nUser just asked: "${userQuestion}"\nTool ran: ${toolName}(${JSON.stringify(toolArgs)})\nRaw output:\n${toolOutput}\n\nWrite a clear, helpful response based on the tool output and conversation context.`;
    
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent(prompt);
    if (result.response.usageMetadata) METRICS.totalTokensPublic += result.response.usageMetadata.totalTokenCount;
    return result.response.text().trim();
}

export async function jarvisSynthesise(messages, toolName, toolArgs, toolOutput, broadcastLog, broadcastStatus) {
    try {
        if (broadcastStatus) broadcastStatus('synthesising', '✨ Local AI synthesising...');
        const localResponse = await localSynthesise(messages, toolOutput);
        if (localResponse.startsWith("Output:\n")) throw new Error("Local model failed to synthesise");
        return { text: localResponse, model: getBestLocalModel('synthesiser') };
    } catch (e) {
        broadcastLog('[Synthesiser] Local model failed — using Cloud fallback');
        if (broadcastStatus) broadcastStatus('synthesising', '✨ Cloud AI (Gemini) synthesising...');
        const cloudText = await cloudSynthesise(messages, toolName, toolArgs, toolOutput);
        return { text: cloudText, model: 'gemini-2.5-flash' };
    }
}

export async function localSynthesise(messages, toolOutput) {
    const userQuestion = messages[messages.length - 1]?.content || "";
    const historyText = messages.slice(-3, -1).map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n');
    const prompt = `Recent context:\n${historyText}\nUser asked: "${userQuestion}"\nRaw output:\n${toolOutput}\nWrite a natural language response summarizing the output to the user.`;
    try {
        const bestModel = getBestLocalModel('synthesiser');
        const data = await runLocalModel(bestModel, [{ role: 'user', content: prompt }]);
        return data.message?.content || `Output:\n${toolOutput}`;
    } catch {
        return `Output:\n${toolOutput}`;
    }
}
