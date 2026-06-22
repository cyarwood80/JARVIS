import express from 'express';
import cors from 'cors';
import path from 'path';
import { spawn, exec } from 'child_process';
import { WebSocketServer } from 'ws';
import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs/promises';

import { PORT, ROOT_DIR, GEMINI_API_KEY, MODEL_REGISTRY, modelWarmth, METRICS, COLD_THRESHOLD_MS, LARGE_MODELS, isModelCold, markModelWarm } from './config.js';
import { startContextMonitors, startProactiveAgency, setupAutonomousSensors } from './services/system.service.js';
import { updateInteractionTime, startSleepCycle } from './services/memory.service.js';
import { refreshModels, geminiPlan, geminiSynthesise, runLocalModel } from './services/ai.service.js';
import { executeTool } from './tools/executor.js';

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(ROOT_DIR, 'public')));

// ── WEBSOCKET SETUP ──────────────────────────────
const server = app.listen(PORT, async () => {
    console.log(`\n🚀 Jarvis AI Hub running on http://localhost:${PORT}`);
    await refreshModels();
    
    // Auto-start OpenClaw
    const openClawDir = path.join(ROOT_DIR, 'openclaw');
    try {
        await fs.access(openClawDir);
        console.log(`   Starting OpenClaw Gateway...`);
        openClawProcess = spawn('node', ['index.js'], { cwd: openClawDir });
        openClawProcess.stdout.on('data', d => broadcastLog(d.toString()));
        openClawProcess.stderr.on('data', d => broadcastLog(`[ERROR] ${d.toString()}`));
        openClawProcess.on('close', c => { openClawProcess = null; });
    } catch {}

    // Launch in Windowed App Mode (No URL bar)
    exec(`start msedge --app=http://localhost:${PORT}`, (err) => {
        if (err) {
            exec(`start chrome --app=http://localhost:${PORT}`, (err2) => {
                if (err2) exec(`start http://localhost:${PORT}`); // fallback
            });
        }
    });
    
    startContextMonitors();
    startProactiveAgency(msg => broadcastMsg(msg));
    startSleepCycle();
    setupAutonomousSensors();
});

const wss = new WebSocketServer({ server });
const clients = new Set();
wss.on('connection', ws => {
    clients.add(ws);
    ws.send(JSON.stringify({ type: 'log', message: '🔗 Connected to Jarvis Console...' }));
    ws.on('close', () => clients.delete(ws));
});

function broadcastLog(message) {
    const payload = JSON.stringify({ type: 'log', message: message.trim() });
    for (const c of clients) if (c.readyState === 1) c.send(payload);
}
function broadcastStatus(stage, message) {
    const payload = JSON.stringify({ type: 'status', stage, message });
    for (const c of clients) if (c.readyState === 1) c.send(payload);
}
function broadcastColdStart(modelShortName) {
    const payload = JSON.stringify({ type: 'cold_start', model: modelShortName });
    for (const c of clients) if (c.readyState === 1) c.send(payload);
}
function broadcastMsg(msgObj) {
    const payload = JSON.stringify(msgObj);
    for (const c of clients) if (c.readyState === 1) c.send(payload);
}

let openClawProcess = null;

// ── API ENDPOINTS ──────────────────────────────
app.get('/api/stats', async (req, res) => {
    const { getPcDiagnostics } = await import('./services/system.service.js');
    try {
        const stats = await getPcDiagnostics();
        res.json({ ...stats, metrics: METRICS, registry: MODEL_REGISTRY });
    } catch {
        res.status(500).json({ error: 'Failed' });
    }
});

app.get('/api/warmth', (req, res) => {
    const status = {};
    for (const [model, lastUsed] of Object.entries(modelWarmth)) {
        status[model] = {
            warm: lastUsed > 0 && (Date.now() - lastUsed) < COLD_THRESHOLD_MS,
            lastUsed: lastUsed > 0 ? new Date(lastUsed).toISOString() : null,
            info: MODEL_REGISTRY[model] || { specialisms: '', size: '? GB' }
        };
    }
    res.json(status);
});

app.get('/api/scripts', async (req, res) => {
    const scriptsDir = path.join(ROOT_DIR, 'scripts');
    try {
        await fs.access(scriptsDir);
        const files = (await fs.readdir(scriptsDir)).filter(f => f.endsWith('.ps1') || f.endsWith('.js'));
        let meta = {};
        try { meta = JSON.parse(await fs.readFile(path.join(scriptsDir, 'meta.json'), 'utf8')); } catch {}
        res.json({ scripts: files.map(f => ({ name: f, description: meta[f] || '', size: 0 })) });
    } catch {
        res.json({ scripts: [] });
    }
});

// ── MAIN CHAT ENDPOINT ──────────────────────────────
app.post('/v1/chat/completions', async (req, res) => {
    const startTime = Date.now();
    updateInteractionTime();
    
    let messages = req.body.messages || [];
    const userQuestion = messages[messages.length - 1]?.content || "";
    
    console.log(`\n[PROXY] Received: "${userQuestion}"`);
    broadcastStatus('thinking', '⚡ Request received — Gemini is planning...');

    let plan, modelUsed = "gemini", toolWasUsed = false, toolName = null, toolArgs = {}, toolOutput = "";
    let retryCount = 0, errorFeedback = "", usedGeminiDirectly = false, finalResponseText = "";

    while (retryCount < 3) {
        try {
            let planningMessages = [...messages];
            if (errorFeedback) planningMessages.push({ role: 'user', content: `Error: ${errorFeedback}\nRevise plan.` });
            
            plan = await geminiPlan(planningMessages, broadcastLog);
            if (!errorFeedback) broadcastStatus('planned', `🧠 Plan: ${plan.intent}`);
        } catch {
            usedGeminiDirectly = true;
            break;
        }

        if (plan && !usedGeminiDirectly) {
            const assignedModel = plan.local_model;
            if (isModelCold(assignedModel) && LARGE_MODELS.has(assignedModel)) {
                broadcastColdStart(assignedModel.split(':')[0]);
            }

            if (plan.needs_tool && plan.tool) {
                toolName = plan.tool; toolArgs = plan.args || {}; toolWasUsed = true;
                broadcastStatus('executing', `🔧 Executing ${toolName}...`);

                try {
                    toolOutput = await executeTool(toolName, toolArgs, messages, broadcastMsg);
                    markModelWarm(assignedModel);
                    modelUsed = assignedModel;

                    if (String(toolOutput).includes("Command failed:") || String(toolOutput).includes("Error:")) {
                        errorFeedback = String(toolOutput).substring(0, 500);
                        retryCount++; continue;
                    }
                    break;
                } catch (e) {
                    errorFeedback = e.message; retryCount++; continue;
                }
            } else {
                broadcastStatus('generating', `💬 ${assignedModel} composing...`);
                try {
                    const localData = await runLocalModel(assignedModel, messages, null);
                    finalResponseText = localData.message?.content || "";
                    markModelWarm(assignedModel);
                    modelUsed = assignedModel;
                    break;
                } catch {
                    usedGeminiDirectly = true; break;
                }
            }
        } else { break; }
    }

    if (toolWasUsed && toolOutput) {
        broadcastStatus('synthesising', '✨ Gemini synthesising...');
        try {
            finalResponseText = await geminiSynthesise(userQuestion, toolName, toolArgs, toolOutput, broadcastLog);
            modelUsed += '+gemini';
        } catch {
            finalResponseText = `Output:\n${toolOutput}`;
        }
    }

    if (usedGeminiDirectly || !finalResponseText) {
        broadcastStatus('generating', '🌐 Gemini is responding...');
        try {
            const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
            const geminiModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
            const history = messages.slice(0, -1).map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
            const chat = geminiModel.startChat({ history });
            const result = await chat.sendMessage(userQuestion);
            finalResponseText = result.response.text();
            modelUsed = 'gemini';
        } catch (e) {
            finalResponseText = `Failed: ${e.message}`;
            modelUsed = 'error';
        }
    }

    broadcastStatus('done', '');
    res.json({
        id: `chatcmpl-${Date.now()}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: modelUsed,
        plan: plan || null,
        choices: [{ message: { role: "assistant", content: finalResponseText } }]
    });
});

process.on('SIGINT', () => {
    if (openClawProcess) openClawProcess.kill('SIGKILL');
    process.exit();
});
