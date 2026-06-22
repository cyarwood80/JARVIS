import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import si from 'systeminformation';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { spawn, exec } from 'child_process';
import fs from 'fs';
import { search, SafeSearchType } from 'duck-duck-scrape';
import activeWin from 'active-win';
import clipboardy from 'clipboardy';
import notifier from 'node-notifier';
import cron from 'node-cron';
import chokidar from 'chokidar';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// ENVIRONMENTAL AWARENESS
// ==========================================
let activeWindowContext = "Unknown";
let clipboardContext = "Empty";

setInterval(async () => {
    try {
        const win = await activeWin();
        activeWindowContext = win ? `[${win.owner?.name || win.title}] ${win.title}` : "Unknown";
    } catch(e) {}
    try {
        const text = await clipboardy.read();
        clipboardContext = text ? text.substring(0, 500) : "Empty";
    } catch(e) {}
}, 2000);

// ==========================================
// PROACTIVE AGENCY (5 min interval)
// ==========================================
setInterval(async () => {
    // Check Windows Application Event Logs for Errors in the last 5 mins
    const script = `Get-WinEvent -FilterHashtable @{LogName='Application'; Level=2; StartTime=(Get-Date).AddMinutes(-5)} -MaxEvents 2 -ErrorAction SilentlyContinue | Select-Object Message | ConvertTo-Json`;
    
    exec(`powershell -NoProfile -Command "${script}"`, async (error, stdout) => {
        if (!error && stdout && stdout.trim().length > 5) {
            try {
                const logs = JSON.parse(stdout);
                const logMsgs = Array.isArray(logs) ? logs.map(l => l.Message).join(' | ') : logs.Message;
                
                // Gemini Synthesises the alert
                if (GEMINI_API_KEY) {
                    const prompt = `You are JARVIS, an AI assistant running on a Windows PC. You proactively monitor the system. You just detected these critical application errors in the background:\n${logMsgs}\nWrite a short, conversational alert to the user warning them about this. Keep it under 2 sentences.`;
                    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
                    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
                    const result = await model.generateContent(prompt);
                    const alertText = result.response.text();
                    
                    wss.clients.forEach(client => {
                        if (client.readyState === 1) {
                            client.send(JSON.stringify({ type: 'PROACTIVE_MSG', data: alertText }));
                        }
                    });
                }
            } catch(e) {}
        }
    });
}, 5 * 60 * 1000);

// ==========================================
// MEMORY CONSOLIDATION (Sleep Cycle)
// ==========================================
let lastInteractionTime = Date.now();
let hasConsolidatedMemoryToday = false;

setInterval(async () => {
    const idleTime = Date.now() - lastInteractionTime;
    
    if (idleTime > 10 * 60 * 1000 && !hasConsolidatedMemoryToday && GEMINI_API_KEY) {
        const memPath = path.join(__dirname, 'vault', 'chris.md');
        if (fs.existsSync(memPath)) {
            try {
                console.log("[SLEEP CYCLE] System idle. Initiating memory consolidation...");
                const rawMemory = fs.readFileSync(memPath, 'utf8');
                const prompt = `You are JARVIS's background memory manager. Consolidate the following raw memory vault. 
Merge overlapping facts, delete duplicate lines, correct any conflicting information, and rewrite it as a beautifully clean, categorized Markdown Knowledge Graph. 
Do not add conversational text, just output the pure Markdown.
\n\nRAW MEMORY:\n${rawMemory}`;

                const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
                const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
                const result = await model.generateContent(prompt);
                
                let cleanedMemory = result.response.text().trim();
                cleanedMemory = cleanedMemory.replace(/^```(?:markdown)?\s*/i, '').replace(/\s*```$/, '').trim();
                
                fs.writeFileSync(memPath, cleanedMemory);
                console.log("[SLEEP CYCLE] Memory consolidation complete.");
                
                hasConsolidatedMemoryToday = true;
                setTimeout(() => hasConsolidatedMemoryToday = false, 12 * 60 * 60 * 1000); // Reset after 12 hours
            } catch(e) {
                console.error("[SLEEP CYCLE] Consolidation failed:", e.message);
            }
        }
    }
}, 60 * 1000);

// ==========================================
// MODEL WARMTH TRACKER
// Tracks last successful call per model.
// If > 5 mins since last call, model is "cold".
// ==========================================
const COLD_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

const modelWarmth = {};

const METRICS = {
    totalTokensLocal: 0,
    totalTokensPublic: 0,
    models: {}
};

// Large models that have a meaningful cold-start delay
const LARGE_MODELS = new Set(['qwen2.5:32b', 'gemma4:26b']);

function isModelCold(modelName) {
    const last = modelWarmth[modelName] || 0;
    return (Date.now() - last) > COLD_THRESHOLD_MS;
}

function markModelWarm(modelName) {
    modelWarmth[modelName] = Date.now();
    console.log(`[WARMTH] Marked ${modelName} as warm.`);
}

// ==========================================
// DYNAMIC MODEL CAPABILITY REGISTRY
// Gemini planner uses this to make routing decisions.
// ==========================================
let MODEL_REGISTRY = {};

const KNOWN_CAPABILITIES = {
    'hermes3': {
        specialisms: 'OS commands, system queries, user/session info, event logs, file operations, network info',
        toolCalling: 'reliable'
    },
    'qwen2.5': {
        specialisms: 'Code generation, scripts, debugging, programming tasks, data transformation',
        toolCalling: 'very reliable'
    },
    'gemma4': {
        specialisms: 'Complex multi-step reasoning, data analysis, long-form content, research tasks, vision, image analysis, photo recognition',
        toolCalling: 'native best'
    },
    'llama3.1': {
        specialisms: 'Simple factual Q&A, general conversation, quick answers with no tool required',
        toolCalling: 'limited'
    },
    'llama3': {
        specialisms: 'Summarisation, condensing long tool outputs, instruction following',
        toolCalling: 'limited'
    },
    'nemotron3-nano-omni': {
        specialisms: 'Unified multimodal media, image parsing, photo analysis, video/audio understanding',
        toolCalling: 'limited'
    },
    'minicpm': {
        specialisms: 'Pocket-sized ultra-fast image recognition, photo transcription, lightweight visual tasks',
        toolCalling: 'none'
    }
};

async function refreshModels() {
    try {
        const res = await fetch(`${OLLAMA_URL}/api/tags`);
        if (!res.ok) return;
        const data = await res.json();
        
        const newRegistry = {};
        for (const model of data.models) {
            const name = model.name;
            const sizeGB = (model.size / 1e9).toFixed(1) + 'GB';
            
            // Find best matching capability
            let matchedCaps = { specialisms: 'General purpose tasks', toolCalling: 'unknown' };
            for (const [key, caps] of Object.entries(KNOWN_CAPABILITIES)) {
                if (name.toLowerCase().includes(key)) {
                    matchedCaps = caps;
                    break;
                }
            }
            
            newRegistry[name] = {
                specialisms: matchedCaps.specialisms,
                toolCalling: matchedCaps.toolCalling,
                size: sizeGB
            };
            if (!(name in modelWarmth)) {
                modelWarmth[name] = 0;
            }
        }
        MODEL_REGISTRY = newRegistry;
    } catch (e) {
        console.error('[OLLAMA] Failed to fetch models:', e.message);
    }
}


// ==========================================
// PC PERFORMANCE STATS ENDPOINT
// ==========================================
app.get('/api/stats', async (req, res) => {
    try {
        const [cpu, mem, disk] = await Promise.all([
            si.currentLoad(),
            si.mem(),
            si.fsSize()
        ]);
        const mainDisk = disk.find(d => d.mount === 'C:') || disk[0];
        res.json({
            cpu: Math.round(cpu.currentLoad),
            memory: Math.round((mem.active / mem.total) * 100),
            disk: mainDisk ? Math.round(mainDisk.use) : 0,
            metrics: METRICS,
            registry: MODEL_REGISTRY
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch PC stats' });
    }
});

// ==========================================
// TOOLS REGISTRY
// ==========================================
const openAiTools = [
    {
        type: "function",
        function: {
            name: "open_application",
            description: "Opens a Windows graphical application by its name (e.g., 'spotify', 'calc', 'notepad').",
            parameters: {
                type: "object",
                properties: { appName: { type: "string" } },
                required: ["appName"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "get_pc_diagnostics",
            description: "Returns the current CPU, RAM, and Disk hardware usage percentages.",
            parameters: { type: "object", properties: {}, required: [] }
        }
    },
    {
        type: "function",
        function: {
            name: "execute_command",
            description: "Executes a Windows PowerShell command. Use this to manage files, interact with the OS, query system info, event logs, user sessions, network status, or any system state.",
            parameters: {
                type: "object",
                properties: { command: { type: "string" } },
                required: ["command"]
            }
        }
    }
];

// ==========================================
// TOOL EXECUTOR
// ==========================================
async function executeTool(name, args, chatHistory) {
    console.log(`[TOOL CALLED] ${name}`, args);

    if (name === 'get_pc_diagnostics') {
        const [cpu, mem, disk] = await Promise.all([si.currentLoad(), si.mem(), si.fsSize()]);
        const mainDisk = disk.find(d => d.mount === 'C:') || disk[0];
        return `CPU Usage: ${Math.round(cpu.currentLoad)}%, Memory Usage: ${Math.round((mem.active / mem.total) * 100)}%, Disk Usage: ${mainDisk ? Math.round(mainDisk.use) : 'N/A'}%`;
    }

    if (name === 'open_application') {
        return new Promise((resolve) => {
            exec(`start ${args.appName}`, (err) => {
                if (err) resolve(`Failed to open ${args.appName}. Error: ${err.message}`);
                else resolve(`Successfully launched ${args.appName}.`);
            });
        });
    }

    if (name === 'save_script') {
        const scriptsDir = path.join(__dirname, 'scripts');
        if (!fs.existsSync(scriptsDir)) fs.mkdirSync(scriptsDir);
        // Ensure extension is .ps1 or .js, default to .ps1
        let filename = args.scriptName;
        if (!filename.endsWith('.ps1') && !filename.endsWith('.js')) {
            filename += '.ps1';
        }
        const scriptPath = path.join(scriptsDir, filename);
        fs.writeFileSync(scriptPath, args.code, 'utf8');
        
        const metaPath = path.join(scriptsDir, 'meta.json');
        let meta = {};
        if (fs.existsSync(metaPath)) meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        meta[filename] = args.description || 'Created by Jarvis';
        fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8');

        return `Successfully saved script: ${filename} to the Automation Vault.`;
    }

    if (name === 'run_saved_script') {
        const scriptsDir = path.join(__dirname, 'scripts');
        const scriptPath = path.join(scriptsDir, args.scriptName);
        if (!fs.existsSync(scriptPath)) {
            return `Error: Script '${args.scriptName}' does not exist in the Automation Vault. Use list_scripts to see available scripts.`;
        }
        
        return new Promise((resolve) => {
            const isNode = args.scriptName.endsWith('.js');
            const cmdArgs = args.args || '';
            const cmd = isNode 
                ? `node "${scriptPath}" ${cmdArgs}`
                : `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${scriptPath}" ${cmdArgs}`;
                
            exec(cmd, { timeout: 30000 }, (err, stdout, stderr) => {
                if (err) resolve(`Script failed: ${stderr || err.message}`);
                else resolve(stdout.trim() || '[Script ran successfully with no output]');
            });
        });
    }

    if (name === 'list_scripts') {
        const scriptsDir = path.join(__dirname, 'scripts');
        if (!fs.existsSync(scriptsDir)) return "The Automation Vault is empty (no scripts directory).";
        const files = fs.readdirSync(scriptsDir);
        if (files.length === 0) return "The Automation Vault is currently empty.";
        return `Available saved scripts:\n` + files.map(f => `- ${f}`).join('\n');
    }

    if (name === 'search_web') {
        try {
            const results = await search(args.query, { safeSearch: SafeSearchType.MODERATE });
            if (!results.results || results.results.length === 0) {
                return `No web search results found for: ${args.query}`;
            }
            // Return top 3 results
            const topResults = results.results.slice(0, 3).map(r => 
                `TITLE: ${r.title}\nURL: ${r.url}\nSUMMARY: ${r.description}\n`
            ).join('\n---\n');
            return `Web Search Results for "${args.query}":\n\n${topResults}`;
        } catch (err) {
            return `Web search failed: ${err.message}`;
        }
    }

    if (name === 'manage_memory') {
        const vaultDir = path.join(__dirname, 'vault');
        if (!fs.existsSync(vaultDir)) fs.mkdirSync(vaultDir);
        const memFile = path.join(vaultDir, 'chris.md');
        
        if (args.action === 'append') {
            const dateStr = new Date().toISOString().split('T')[0];
            const fact = `- [${dateStr}] ${args.fact}\n`;
            fs.appendFileSync(memFile, fact, 'utf8');
            return `Successfully remembered: ${args.fact}`;
        } else if (args.action === 'read' || args.action === 'search') {
            if (fs.existsSync(memFile)) return fs.readFileSync(memFile, 'utf8') || "Memory is currently empty.";
            return "Memory is currently empty.";
        } else if (args.action === 'clear') {
            if (fs.existsSync(memFile)) fs.writeFileSync(memFile, '', 'utf8');
            return "Memory cleared.";
        }
        return "Unknown memory action.";
    }

    if (name === 'execute_command') {
        // SECURITY CHECK: Block genuinely destructive commands without explicit permission.
        // Uses explicit command-name matching only — never blocks diagnostic/read-only commands.
        const dangerousCommands = ['remove-item', 'rmdir', 'rd ', 'del ', 'format-volume', 'clear-disk', 'initialize-disk'];
        const commandLower = args.command.toLowerCase();
        const isDestructive = dangerousCommands.some(d => commandLower.includes(d));
        if (isDestructive) {
            const lastMsg = chatHistory[chatHistory.length - 1]?.content?.toLowerCase() || "";
            if (!lastMsg.includes('yes') && !lastMsg.includes('proceed') && !lastMsg.includes('do it')) {
                return `SECURITY BLOCK: Command '${args.command}' is destructive. You MUST ask the user for explicit permission before running this.`;
            }
        }

        return new Promise((resolve) => {
            // Write command to a temp .ps1 file to safely handle any syntax (script blocks,
            // special chars, quotes) without shell-escaping issues
            const tmpFile = path.join(__dirname, `_jarvis_tmp_${Date.now()}.ps1`);
            fs.writeFileSync(tmpFile, args.command, 'utf8');
            exec(`powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${tmpFile}"`,
                { timeout: 15000 },
                (err, stdout, stderr) => {
                    // Clean up temp file regardless of outcome
                    try { fs.unlinkSync(tmpFile); } catch (_) {}
                    if (err) resolve(`Command failed: ${stderr || err.message}`);
                    else resolve(stdout.trim() || '[Command ran successfully with no output]');
                }
            );
        });
    }

    if (name === 'whatsapp_push') {
        return new Promise(async (resolve) => {
            try {
                const res = await fetch('http://127.0.0.1:3001/api/send', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message: args.message })
                });
                if (res.ok) resolve('WhatsApp push message sent successfully.');
                else resolve('Failed to send WhatsApp push message. OpenClaw might be disconnected or admin.txt missing.');
            } catch (e) {
                resolve(`WhatsApp push error: ${e.message}`);
            }
        });
    }

    if (name === 'voice_alert') {
        broadcastLog(`[Voice Alert] ${args.message}`);
        // Send a WebSocket message to the browser dashboard to trigger TTS
        wss.clients.forEach(client => {
            if (client.readyState === 1) {
                client.send(JSON.stringify({ type: 'speak', text: args.message }));
            }
        });
        return 'Voice alert played through PC speakers.';
    }

    if (name === 'desktop_notify') {
        notifier.notify({
            title: args.title || 'Jarvis Notification',
            message: args.message,
            sound: true,
            wait: false
        });
        return 'Windows desktop notification sent.';
    }

    return "Tool not found.";
}

// ==========================================
// GEMINI INTENT PLANNER
// Replaces the old keyword-based determineRoute().
// Returns a structured JSON plan.
// ==========================================
const PLANNER_SYSTEM_PROMPT = `You are JARVIS's planning brain running on a Windows 11 PC. Your ONLY job is to analyse the user's intent and output a precise JSON execution plan.

Available tools:
  - execute_command(command): Run any PowerShell command on the user's Windows PC
  - open_application(appName): Launch a Windows application
  - get_pc_diagnostics(): Get current CPU, RAM, and Disk usage percentages
  - manage_memory(action, fact): "action" can be "append", "read", "search", "clear". Use "append" to save important facts the user tells you (e.g. names, preferences).
  - save_script(scriptName, description, code): Save a reusable PowerShell (.ps1) or Node (.js) script to the Automation Vault. Do this when the user asks you to create a script and retain it for future use. "description" should be a short summary of what it does.
  - run_saved_script(scriptName, args): Run a script previously saved in the Automation Vault.
  - list_scripts(): List all scripts currently saved in the Automation Vault.
  - search_web(query): Search the live internet using DuckDuckGo. Use this to answer questions about current events, find documentation, or fetch data not on the local PC.
  - whatsapp_push(message): Send an autonomous WhatsApp text message to the user's phone.
  - voice_alert(message): Speak a text string out loud through the PC speakers using Piper TTS.
  - desktop_notify(title, message): Pop up a native Windows 11 desktop notification.

Available local executor models and their specialisms:
  - hermes3:latest: OS commands, system queries, user/session info, event logs, file operations, network info
  - qwen2.5:32b: Code generation, scripts, debugging, programming tasks, data transformation
  - gemma4:26b: Complex multi-step reasoning, data analysis, long-form content, web research
  - llama3.1:8b: Simple factual Q&A, general conversation, quick answers with NO tool required

Critical Rules:
1. NEVER say you cannot access something. ALWAYS use execute_command to find the answer from the OS, or search_web for the internet.
2. For ANY question about the PC state (users, sessions, processes, logs, files, network, installed software): use execute_command with the correct PowerShell command.
3. Output ONLY valid JSON. No preamble, no explanation, no markdown fencing.
4. "needs_tool" must be true whenever you assign a tool.
5. If a task needs a tool AND a local model to generate text, set needs_tool=true and assign the appropriate local_model.
6. For pure conversational questions (greetings, general knowledge) with NO system action needed, set needs_tool=false and use llama3.1:8b.
7. When the user tells you something personal or asks you to remember something, use manage_memory with action="append".
8. If the user asks you to "create a script and retain it", use save_script. Give it a descriptive name like "check_event_logs.ps1". Make sure the code works.

Critical PowerShell Rules for commands you generate:
1. NEVER use curly brace script blocks like ForEach-Object { } or Where-Object { } - these break JSON serialisation. Use -FilterScript with simple expressions or pipeline methods instead.
2. ALWAYS use the simplest working command. Prefer: whoami, $env:USERNAME, Get-WmiObject, Get-Process (without script blocks), Get-Service, Get-Date, ipconfig, netstat.
3. For user/session info: use "[System.Security.Principal.WindowsIdentity]::GetCurrent().Name" or "whoami" - not CimInstance.
4. For process filtering: use "Get-Process | Where-Object Name -eq 'notepad'" NOT "Where-Object { $_.Name -eq 'notepad' }".

Output format (strict JSON, nothing else):
{"intent": "<concise description>", "needs_tool": true|false, "tool": "<tool_name or null>", "args": {<tool args or empty object>}, "local_model": "<model_name>"}

Examples:
- "who is logged on to my pc" -> {"intent": "Find logged on user", "needs_tool": true, "tool": "execute_command", "args": {"command": "[System.Security.Principal.WindowsIdentity]::GetCurrent().Name"}, "local_model": "hermes3:latest"}
- "what processes are running" -> {"intent": "List running processes", "needs_tool": true, "tool": "execute_command", "args": {"command": "Get-Process | Select-Object Name,CPU,WorkingSet | Sort-Object CPU -Descending | Select-Object -First 20 | Format-Table -AutoSize"}, "local_model": "hermes3:latest"}
- "Jarvis, my dog is called Max" -> {"intent": "Remember user fact", "needs_tool": true, "tool": "manage_memory", "args": {"action": "append", "fact": "User's dog is called Max"}, "local_model": "hermes3:latest"}
- "create a script to check vmware event logs and retain it" -> {"intent": "Save script to check vmware event logs", "needs_tool": true, "tool": "save_script", "args": {"scriptName": "check_vmware_events.ps1", "description": "Fetches the latest VMware application event logs", "code": "Get-EventLog -LogName Application -Source VMware* -EntryType Error,Warning -Newest 20"}, "local_model": "qwen2.5:32b"}
- "run the vmware script" -> {"intent": "Run saved script check_vmware_events.ps1", "needs_tool": true, "tool": "run_saved_script", "args": {"scriptName": "check_vmware_events.ps1"}, "local_model": "hermes3:latest"}
- "who won the 2024 super bowl" -> {"intent": "Search web for 2024 super bowl winner", "needs_tool": true, "tool": "search_web", "args": {"query": "2024 super bowl winner"}, "local_model": "gemma4:26b"}`;

// ==========================================
// RATE LIMIT / QUOTA DETECTOR
// ==========================================
function isRateLimitError(err) {
    const msg = err?.message || '';
    return msg.includes('429') || msg.includes('quota') || msg.includes('Too Many Requests') || msg.includes('rate limit');
}

// ==========================================
// LOCAL FALLBACK PLANNER (gemma4:26b)
// Used when Gemini quota is exhausted.
// Asks gemma4 to produce the same JSON plan format.
// ==========================================
async function localFallbackPlan(messages) {
    const latestPrompt = messages[messages.length - 1]?.content || "";
    console.log('[LOCAL PLANNER] Gemini quota hit — using gemma4:26b as fallback planner');
    broadcastLog('[Local Planner] Gemini quota hit — falling back to gemma4:26b planner');

    // Load Memory Core
    let coreMemory = "";
    const memPath = path.join(__dirname, 'vault', 'chris.md');
    if (fs.existsSync(memPath)) {
        coreMemory = `\n\n<LONG_TERM_MEMORY>\n${fs.readFileSync(memPath, 'utf8')}\n</LONG_TERM_MEMORY>`;
    }

    const currentTime = `\nThe current date and time is: ${new Date().toLocaleString()}.\n`;
    const envContext = `The user's currently active window is: ${activeWindowContext}\nThe user's clipboard contains: "${clipboardContext}"\n`;
    const localPlanPrompt = PLANNER_SYSTEM_PROMPT + currentTime + envContext + coreMemory + `\n\nLatest user message: "${latestPrompt}"\n\nOutput the JSON plan:`;
    const localData = await runLocalModel('gemma4:26b', [
        { role: 'user', content: localPlanPrompt }
    ], null);

    const raw = (localData.message?.content || '').trim();
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    // Extract just the JSON object if there's surrounding text
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Local planner produced no valid JSON');

    const plan = JSON.parse(jsonMatch[0]);
    if (typeof plan.intent !== 'string' || typeof plan.needs_tool !== 'boolean') {
        throw new Error('Local plan missing required fields');
    }
    broadcastLog(`[Local Planner] gemma4 plan: "${plan.intent}" → ${plan.local_model}`);
    return plan;
}

async function geminiPlan(messages) {
    if (!GEMINI_API_KEY) {
        throw new Error('No Gemini API key configured — cannot run planner.');
    }

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    // Build conversation context for the planner (last 3 turns for brevity)
    const recentContext = messages.slice(-6).map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n');
    const latestPrompt = messages[messages.length - 1]?.content || "";

    // Load Memory Core
    let coreMemory = "";
    const memPath = path.join(__dirname, 'vault', 'chris.md');
    if (fs.existsSync(memPath)) {
        coreMemory = `\n\n<LONG_TERM_MEMORY>\n${fs.readFileSync(memPath, 'utf8')}\n</LONG_TERM_MEMORY>`;
    }

    const currentTime = `\nThe current date and time is: ${new Date().toLocaleString()}.\n`;
    const envContext = `The user's currently active window is: ${activeWindowContext}\nThe user's clipboard contains: "${clipboardContext}"\n`;
    const plannerPrompt = `${PLANNER_SYSTEM_PROMPT}${currentTime}${envContext}${coreMemory}\n\nConversation context:\n${recentContext}\n\nLatest user message: "${latestPrompt}"\n\nOutput the JSON plan:`;

    try {
        const result = await model.generateContent(plannerPrompt);
        
        if (result.response.usageMetadata) {
            METRICS.totalTokensPublic += result.response.usageMetadata.totalTokenCount || 0;
        }

        const raw = result.response.text().trim();
        const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

        const plan = JSON.parse(cleaned);
        if (typeof plan.intent !== 'string' || typeof plan.needs_tool !== 'boolean' || typeof plan.local_model !== 'string') {
            throw new Error('Plan missing required fields');
        }
        return plan;
    } catch (e) {
        // If it's a rate-limit/quota error, try the local fallback planner
        if (isRateLimitError(e)) {
            console.warn('[PLANNER] Gemini quota exceeded — switching to local fallback planner');
            return await localFallbackPlan(messages);
        }
        // For JSON parse errors, return a safe default
        console.error('[PLANNER] Failed to parse plan:', e.message);
        return {
            intent: latestPrompt,
            needs_tool: false,
            tool: null,
            args: {},
            local_model: 'hermes3:latest'
        };
    }
}

// ==========================================
// GEMINI SYNTHESISER
// Takes raw tool output and composes a human-readable response.
// ==========================================
async function geminiSynthesise(userQuestion, toolName, toolArgs, toolOutput) {
    if (!GEMINI_API_KEY) {
        return await localSynthesise(userQuestion, toolOutput);
    }

    const synthesisePrompt = `You are JARVIS, a helpful AI assistant. The user asked: "${userQuestion}"

To answer this, we ran the following on their Windows PC:
- Tool: ${toolName}
- Arguments: ${JSON.stringify(toolArgs)}
- Raw output from the system:
\`\`\`
${toolOutput}
\`\`\`

Write a clear, concise, natural language response to the user based on the above output. Be specific and include the actual data. Do not say you "cannot access" anything — you already have the data above. If the output is empty or indicates no results, say so clearly.`;

    try {
        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        const result = await model.generateContent(synthesisePrompt);
        
        if (result.response.usageMetadata) {
            METRICS.totalTokensPublic += result.response.usageMetadata.totalTokenCount || 0;
        }

        return result.response.text().trim();
    } catch (e) {
        if (isRateLimitError(e)) {
            console.warn('[SYNTHESISER] Gemini quota hit — using local model to synthesise');
            broadcastLog('[Synthesiser] Gemini quota hit — using llama3 to compose response');
            return await localSynthesise(userQuestion, toolOutput);
        }
        throw e; // Rethrow non-quota errors
    }
}

// Local synthesiser fallback — uses llama3:8b-instruct-q8_0 to reword raw tool output
async function localSynthesise(userQuestion, toolOutput) {
    const prompt = `You are JARVIS, an AI assistant. The user asked: "${userQuestion}"

Here is the raw output from the Windows PC system command that was run to answer it:
${toolOutput}

Write a clear, friendly, natural language response based on this output. Include the actual data. Be concise.`;
    try {
        const data = await runLocalModel('llama3:8b-instruct-q8_0', [{ role: 'user', content: prompt }], null);
        return data.message?.content || `Here is what I found:\n\n${toolOutput}`;
    } catch (_) {
        return `Here is what I found:\n\n${toolOutput}`;
    }
}

// ==========================================
// LOCAL MODEL EXECUTOR
// Sends a request to Ollama for a local model to handle.
// Used for tool execution AND direct generation.
// ==========================================
async function runLocalModel(modelName, messages, tools = null) {
    let coreMemory = "";
    const memPath = path.join(__dirname, 'vault', 'chris.md');
    if (fs.existsSync(memPath)) {
        coreMemory = `\n\n<LONG_TERM_MEMORY>\n${fs.readFileSync(memPath, 'utf8')}\n</LONG_TERM_MEMORY>\n`;
    }

    const currentTime = `\nThe current system date and time is: ${new Date().toLocaleString()}.\n`;
    const envContext = `The user's currently active window is: ${activeWindowContext}\nThe user's clipboard contains: "${clipboardContext}"\n`;
    const systemPrompt = tools
        ? `You are JARVIS, an AI assistant on a Windows 11 PC. You have been given a specific task to perform using the provided tool. You MUST call the tool immediately. Do not ask questions, do not explain, do not say you cannot access anything. Execute the tool now.` + currentTime + envContext + coreMemory
        : `You are JARVIS, a highly capable AI assistant. Answer the user's question concisely and accurately.` + currentTime + envContext + coreMemory;

    const ollamaMessages = [
        { role: "system", content: systemPrompt },
        ...messages
    ];

    const body = {
        model: modelName,
        messages: ollamaMessages,
        stream: false,
    };
    if (tools) body.tools = tools;

    const ollamaRes = await fetch(`${OLLAMA_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });

    if (!ollamaRes.ok) {
        throw new Error(`Ollama returned status ${ollamaRes.status} for model ${modelName}`);
    }

    const data = await ollamaRes.json();
    
    if (data.eval_count) {
        METRICS.totalTokensLocal += data.eval_count;
        if (!METRICS.models[modelName]) {
            METRICS.models[modelName] = { runs: 0, tokens: 0, totalGenNs: 0, totalLoadNs: 0 };
        }
        METRICS.models[modelName].runs++;
        METRICS.models[modelName].tokens += data.eval_count;
        METRICS.models[modelName].totalGenNs += (data.eval_duration || 0);
        METRICS.models[modelName].totalLoadNs += (data.load_duration || 0);
    }

    return data;
}

// ==========================================
// API ENDPOINTS
// ==========================================
app.get('/api/scripts', (req, res) => {
    const scriptsDir = path.join(__dirname, 'scripts');
    if (!fs.existsSync(scriptsDir)) {
        return res.json({ scripts: [] });
    }
    const files = fs.readdirSync(scriptsDir).filter(f => f.endsWith('.ps1') || f.endsWith('.js'));
    const metaPath = path.join(scriptsDir, 'meta.json');
    let meta = {};
    if (fs.existsSync(metaPath)) {
        try { meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')); } catch(e){}
    }
    const scripts = files.map(f => ({
        name: f,
        description: meta[f] || 'No description provided.',
        size: fs.statSync(path.join(scriptsDir, f)).size
    }));
    res.json({ scripts });
});

app.post('/api/plan', async (req, res) => {
    try {
        const messages = req.body.messages || [{ role: 'user', content: req.body.prompt || '' }];
        const plan = await geminiPlan(messages);
        res.json({ plan });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ==========================================
// MAIN AI PROXY — 3-STAGE PIPELINE
// Stage 1: Gemini Plans
// Stage 2: Local Model Executes (tool or direct)
// Stage 3: Gemini Synthesises (if tool was used)
// ==========================================
app.post('/v1/chat/completions', async (req, res) => {
    const startTime = Date.now();
    lastInteractionTime = Date.now();
    try {
        let messages = req.body.messages || [];
        const userQuestion = messages[messages.length - 1]?.content || "";
        // Allow caller to hint at an immediate acknowledgment callback
        const ackCallback = req.ackCallback || null;

        console.log(`\n[PROXY] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        console.log(`[PROXY] Received: "${userQuestion}"`);
        broadcastStatus('thinking', '⚡ Request received — Gemini is planning...');

        // ── STAGE 1 & 2: ReAct Loop (Plan & Execute) ───
        let plan;
        let usedGeminiDirectly = false;
        let finalResponseText = "";
        let modelUsed = "gemini";
        let toolWasUsed = false;
        let toolName = null;
        let toolArgs = {};
        let toolOutput = "";

        let retryCount = 0;
        const MAX_RETRIES = 3;
        let errorFeedback = "";

        while (retryCount < MAX_RETRIES) {
            try {
                let planningMessages = [...messages];
                if (errorFeedback) {
                    planningMessages.push({ role: 'user', content: `The previous tool execution failed with error: ${errorFeedback}\n\nPlease revise your plan to fix this error. Either use a different tool, or correct the arguments.` });
                    broadcastStatus('thinking', `🔄 Re-planning (Attempt ${retryCount+1})...`);
                    broadcastLog(`[ReAct Loop] Feeding error back to planner: ${errorFeedback}`);
                } else {
                    broadcastStatus('thinking', '⚡ Request received — Gemini is planning...');
                }

                plan = await geminiPlan(planningMessages);
                console.log(`[STAGE 1] Gemini Plan:`, JSON.stringify(plan, null, 2));
                broadcastLog(`[Gemini Planner] Intent: "${plan.intent}" → ${plan.needs_tool ? `${plan.tool}(${JSON.stringify(plan.args)})` : 'no tool'} → ${plan.local_model}`);
                if (!errorFeedback) broadcastStatus('planned', `🧠 Plan: ${plan.intent} → ${plan.local_model}`);
            } catch (planError) {
                console.error('[STAGE 1] Planner failed:', planError.message);
                broadcastLog(`[Gemini Planner] Planner failed: ${planError.message}. Using Gemini directly.`);
                broadcastStatus('error', '⚠️ Planner offline — using Gemini directly');
                usedGeminiDirectly = true;
                break;
            }

            // ── COLD START CHECK ──────────────────────────
            if (plan && !usedGeminiDirectly) {
                const assignedModel = plan.local_model;
                const cold = isModelCold(assignedModel);
                const isLarge = LARGE_MODELS.has(assignedModel);

                if (cold && isLarge) {
                    const modelShortName = assignedModel.split(':')[0];
                    console.log(`[WARMTH] ${assignedModel} is cold — broadcasting warm-up alert`);
                    broadcastLog(`[Model Warmth] ${assignedModel} is COLD ❄️ — sending warm-up alert`);
                    broadcastStatus('warming', `🧠 Loading specialist model (${modelShortName}) — this may take ~30s`);
                    broadcastColdStart(modelShortName);
                } else if (cold) {
                    broadcastLog(`[Model Warmth] ${assignedModel} is cold but small — loading quickly`);
                    broadcastStatus('warming', `⚡ Loading ${assignedModel}...`);
                } else {
                    broadcastLog(`[Model Warmth] ${assignedModel} is warm ✅`);
                }
            }

            // ── STAGE 2: LOCAL MODEL EXECUTES ─────────────
            if (plan && !usedGeminiDirectly) {
                const assignedModel = plan.local_model;

                if (plan.needs_tool && plan.tool) {
                    toolName = plan.tool;
                    toolArgs = plan.args || {};
                    toolWasUsed = true;

                    broadcastLog(`[Local Executor - ${assignedModel}] Running tool: ${toolName}(${JSON.stringify(toolArgs)})`);
                    broadcastStatus('executing', `🔧 Executing ${toolName} on your PC...`);

                    try {
                        toolOutput = await executeTool(toolName, toolArgs, messages);
                        console.log(`[STAGE 2] Tool result (first 200 chars): ${String(toolOutput).substring(0, 200)}`);
                        broadcastLog(`[Tool Result] ${String(toolOutput).substring(0, 300)}${toolOutput.length > 300 ? '...' : ''}`);
                        markModelWarm(assignedModel);
                        modelUsed = assignedModel;
                        
                        // Autonomous error checking
                        if (String(toolOutput).includes("Command failed:") || String(toolOutput).includes("Exception:") || String(toolOutput).includes("Error:")) {
                            errorFeedback = String(toolOutput).substring(0, 500);
                            retryCount++;
                            continue; // Loop back and re-plan
                        } else {
                            errorFeedback = "";
                            break; // Tool success, exit ReAct loop
                        }
                    } catch (toolError) {
                        console.error('[STAGE 2] Tool execution failed:', toolError.message);
                        toolOutput = `Error executing tool: ${toolError.message}`;
                        broadcastLog(`[Tool Error] ${toolError.message}`);
                        errorFeedback = toolError.message;
                        retryCount++;
                        continue; // Loop back and re-plan
                    }

                } else {
                    // No tool — send directly to local model for generation
                    broadcastLog(`[Local Executor - ${assignedModel}] Generating response directly (no tool needed)`);
                    broadcastStatus('generating', `💬 ${assignedModel} is composing response...`);

                    try {
                        const localData = await runLocalModel(assignedModel, messages, null);
                        finalResponseText = localData.message?.content || "";
                        markModelWarm(assignedModel);
                        modelUsed = assignedModel;
                        console.log(`[STAGE 2] Local model response received from ${assignedModel}`);
                        broadcastLog(`[${assignedModel}] Response generated successfully`);
                        break;
                    } catch (localError) {
                        console.error(`[STAGE 2] Local model ${assignedModel} failed:`, localError.message);
                        broadcastLog(`[Local Model] ${assignedModel} failed: ${localError.message}. Escalating to Gemini.`);
                        usedGeminiDirectly = true;
                        break;
                    }
                }
            } else {
                break;
            }
        }

        // ── STAGE 3: GEMINI SYNTHESISES ───────────────
        if (toolWasUsed && toolOutput) {
            broadcastStatus('synthesising', '✨ Gemini is composing your answer...');
            broadcastLog(`[Gemini Synthesiser] Composing response from tool output...`);

            try {
                finalResponseText = await geminiSynthesise(userQuestion, toolName, toolArgs, toolOutput);
                modelUsed = `${modelUsed}+gemini`;
                console.log(`[STAGE 3] Gemini synthesised response.`);
                broadcastLog(`[Gemini Synthesiser] Response ready ✅`);
            } catch (synthError) {
                console.error('[STAGE 3] Synthesiser failed:', synthError.message);
                broadcastLog(`[Gemini Synthesiser] Failed — returning raw tool output`);
                finalResponseText = `Here is what I found:\n\n${toolOutput}`;
            }
        }

        // ── GEMINI DIRECT FALLBACK ─────────────────────
        if (usedGeminiDirectly || !finalResponseText) {
            broadcastLog(`[Gemini Direct] Handling request directly with Gemini...`);
            broadcastStatus('generating', '🌐 Gemini is responding...');

            try {
                const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
                const geminiModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
                const history = messages.slice(0, -1).map(m => ({
                    role: m.role === 'assistant' ? 'model' : 'user',
                    parts: [{ text: m.content }]
                }));
                const chat = geminiModel.startChat({ history });
                const result = await chat.sendMessage(userQuestion);
                finalResponseText = result.response.text();
                modelUsed = 'gemini';
                broadcastLog(`[Gemini Direct] Response generated ✅`);
            } catch (geminiError) {
                // ── GRACEFUL DEGRADATION ───────────────────────
                // All pipelines failed. Return a helpful explanation rather than
                // crashing with a 500. The user gets a response, the pipeline stays alive.
                const errorDetail = geminiError.message || 'Unknown error';
                console.error('[GEMINI DIRECT] All models failed:', errorDetail);
                broadcastLog(`[Gemini Direct] ⚠️ All models unavailable: ${errorDetail}`);
                broadcastStatus('error', '⚠️ All models temporarily unavailable');

                finalResponseText = [
                    `I'm unable to answer that question right now — all of my available models are temporarily offline or unable to process this request.`,
                    ``,
                    `**What you can do:**`,
                    `• For general knowledge questions, try a public model directly: [ChatGPT](https://chat.openai.com), [Gemini](https://gemini.google.com), or [Claude](https://claude.ai)`,
                    `• For questions about this PC (users, processes, files), try rephrasing — e.g. "run: whoami" or "check my CPU"`,
                    `• If this keeps happening, check the OpenClaw Gateway logs for errors`,
                    ``,
                    `*(Technical detail: ${errorDetail.substring(0, 120)})*`
                ].join('\n');
                modelUsed = 'degraded';
            }
        }

        broadcastStatus('done', '');
        console.log(`[PROXY] ✅ Response ready. Model chain: ${modelUsed}`);
        broadcastLog(`[Jarvis Proxy] ✅ Done. Model chain: ${modelUsed}`);

        // Telemetry tracking
        const endTime = Date.now();
        const durationMs = endTime - startTime;
        
        // Broadcast telemetry to the dashboard
        wss.clients.forEach(client => {
            if (client.readyState === 1) {
                client.send(JSON.stringify({
                    type: 'TELEMETRY_UPDATE',
                    data: {
                        durationMs,
                        modelUsed,
                        route: toolWasUsed ? 'Cloud -> Local -> Cloud' : (usedGeminiDirectly ? 'Cloud Only' : 'Cloud -> Local')
                    }
                }));
            }
        });

        res.json({
            id: `chatcmpl-${Date.now()}`,
            object: "chat.completion",
            created: Math.floor(Date.now() / 1000),
            model: modelUsed,
            plan: plan || null,
            choices: [{ message: { role: "assistant", content: finalResponseText } }]
        });

    } catch (error) {
        // Truly unexpected crash (e.g. bug in our code, not a model failure)
        // Even here, return a 200 with a graceful message so the UI never shows a raw error
        console.error("[PROXY] Unexpected fatal error:", error);
        broadcastStatus('error', `❌ Unexpected error: ${error.message}`);
        res.json({
            id: `chatcmpl-${Date.now()}`,
            object: "chat.completion",
            created: Math.floor(Date.now() / 1000),
            model: 'error',
            choices: [{ message: { role: "assistant", content:
                `I encountered an unexpected internal error and couldn't complete your request.\n\n` +
                `*(${error.message.substring(0, 150)})*\n\n` +
                `Please check the server logs or try rephrasing your question.`
            }}]
        });
    }
});

// ==========================================
// LEGACY CHAT ENDPOINT (Dashboard UI)
// ==========================================
app.post('/api/chat', async (req, res) => {
    const { prompt } = req.body;
    try {
        const proxyRes = await fetch(`http://localhost:${PORT}/v1/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: [{ role: "user", content: prompt }] })
        });
        const data = await proxyRes.json();
        const modelChain = data.model || 'unknown';
        const isCloud = modelChain.includes('gemini');
        return res.json({
            response: data.choices[0].message.content,
            source: isCloud ? 'gemini' : 'local',
            modelName: modelChain,
            plan: data.plan || null
        });
    } catch (e) {
        res.status(503).json({ error: 'Model pipeline failed.' });
    }
});

// ==========================================
// PIPER TTS ENDPOINT
// ==========================================
app.post('/api/tts', (req, res) => {
    const text = req.body.text || "I have nothing to say.";
    const cleanText = text.replace(/[*#]/g, '').replace(/"/g, "'");
    const piperExe = path.join(__dirname, 'piper', 'piper', 'piper.exe');
    const model = path.join(__dirname, 'piper', 'voice', 'en_US-lessac-high.onnx');

    if (!fs.existsSync(piperExe)) return res.status(500).json({ error: 'Piper TTS is missing.' });

    res.setHeader('Content-Type', 'audio/wav');

    const piperProcess = spawn(piperExe, ['-m', model, '-f', '-']);
    
    piperProcess.stdout.pipe(res);
    
    piperProcess.stderr.on('data', (data) => {
        console.error(`[Piper TTS]: ${data.toString().trim()}`);
    });

    piperProcess.stdin.write(cleanText);
    piperProcess.stdin.end();
});

// ==========================================
// OPENCLAW GATEWAY CONTROL
// ==========================================
let openClawProcess = null;
app.post('/api/openclaw/start', (req, res) => {
    if (openClawProcess) return res.json({ message: 'OpenClaw already running.' });
    const openClawDir = path.join(__dirname, 'openclaw');
    openClawProcess = spawn('node', ['index.js'], { cwd: openClawDir });
    openClawProcess.stdout.on('data', d => broadcastLog(d.toString()));
    openClawProcess.stderr.on('data', d => broadcastLog(`[ERROR] ${d.toString()}`));
    openClawProcess.on('close', c => { broadcastLog(`OpenClaw exited with code ${c}`); openClawProcess = null; });
    res.json({ message: 'OpenClaw started successfully.' });
});

app.post('/api/openclaw/stop', (req, res) => {
    if (openClawProcess) {
        openClawProcess.kill();
        openClawProcess = null;
        broadcastLog('OpenClaw was stopped.');
        return res.json({ message: 'OpenClaw stopped.' });
    }
    res.json({ message: 'OpenClaw is not running.' });
});

// ==========================================
// MODEL WARMTH API (for dashboard display)
// ==========================================
app.get('/api/warmth', (req, res) => {
    const status = {};
    for (const [model, lastUsed] of Object.entries(modelWarmth)) {
        status[model] = {
            warm: lastUsed > 0 && (Date.now() - lastUsed) < COLD_THRESHOLD_MS,
            lastUsed: lastUsed > 0 ? new Date(lastUsed).toISOString() : null,
            info: MODEL_REGISTRY[model] || { specialisms: 'General Model', size: '? GB' }
        };
    }
    res.json(status);
});

// ==========================================
// SERVER + WEBSOCKET
// ==========================================
const server = app.listen(PORT, async () => {
    console.log(`\n🚀 Jarvis AI Hub running on http://localhost:${PORT}`);
    console.log(`   Pipeline: Gemini Planner → Local Executor → Gemini Synthesiser`);
    
    // Fetch installed models dynamically
    await refreshModels();
    console.log(`   Models ready: ${Object.keys(MODEL_REGISTRY).join(', ') || 'None found in Ollama'}\n`);

    // Auto-start OpenClaw Gateway
    const openClawDir = path.join(__dirname, 'openclaw');
    if (!openClawProcess && fs.existsSync(openClawDir)) {
        console.log(`   Starting OpenClaw Gateway...`);
        openClawProcess = spawn('node', ['index.js'], { cwd: openClawDir });
        openClawProcess.stdout.on('data', d => broadcastLog(d.toString()));
        openClawProcess.stderr.on('data', d => broadcastLog(`[ERROR] ${d.toString()}`));
        openClawProcess.on('close', c => { broadcastLog(`OpenClaw exited with code ${c}`); openClawProcess = null; });
    }

    // Auto-launch the dashboard in the default browser
    console.log(`   Launching dashboard in your browser...`);
    exec(`start http://localhost:${PORT}`);

    // Start Autonomous Sensors
    setupAutonomousSensors();
});

// ==========================================
// AUTONOMOUS SENSORS & HEARTBEAT
// ==========================================
function setupAutonomousSensors() {
    // 1. Heartbeat Cron (Every 5 minutes)
    cron.schedule('*/5 * * * *', async () => {
        console.log('[HEARTBEAT] Triggering autonomous system check...');
        const prompt = `[AUTONOMOUS HEARTBEAT] The current time is ${new Date().toLocaleTimeString()}. Review the system state, active window, and recent history. Do you need to proactively notify the user about anything (using whatsapp_push, voice_alert, or desktop_notify) or run any background tasks? If no action is needed, just say "No action needed."`;
        
        try {
            await fetch(`http://localhost:${PORT}/v1/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages: [{ role: 'user', content: prompt }] })
            });
        } catch (e) {
            console.error('[HEARTBEAT] Failed to trigger:', e.message);
        }
    });

    // 2. File Sensor (Downloads)
    const downloadsFolder = path.join(process.env.USERPROFILE || process.env.HOME, 'Downloads');
    if (fs.existsSync(downloadsFolder)) {
        console.log(`   [SENSOR] Watching ${downloadsFolder} for new files...`);
        chokidar.watch(downloadsFolder, { ignoreInitial: true, depth: 1 }).on('add', async (filePath) => {
            console.log(`[SENSOR] New file detected: ${filePath}`);
            const prompt = `[FILE SENSOR ALERT] A new file was just downloaded to the Downloads folder: ${filePath}. Analyze this event. Does it look like a normal download, or suspicious? Use execute_command to get file details if necessary. You MUST proactively notify the user about this file using the whatsapp_push tool. Do not use desktop_notify for file downloads.`;
            
            try {
                await fetch(`http://localhost:${PORT}/v1/chat/completions`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ messages: [{ role: 'user', content: prompt }] })
                });
            } catch (e) {
                console.error('[SENSOR] Failed to trigger file alert:', e.message);
            }
        });
    }
}

const wss = new WebSocketServer({ server });
const clients = new Set();

wss.on('connection', (ws) => {
    clients.add(ws);
    ws.send(JSON.stringify({ type: 'log', message: '🔗 Connected to Jarvis Console...' }));
    ws.send(JSON.stringify({ type: 'status', stage: 'idle', message: '' }));
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

// Graceful shutdown
process.on('SIGINT', () => {
    console.log("\nShutting down Jarvis Hub...");
    if (openClawProcess) openClawProcess.kill('SIGKILL');
    process.exit();
});
