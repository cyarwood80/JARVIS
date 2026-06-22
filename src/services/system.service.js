import activeWin from 'active-win';
import clipboardy from 'clipboardy';
import si from 'systeminformation';
import { exec } from 'child_process';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GEMINI_API_KEY, PORT } from '../config.js';
import cron from 'node-cron';
import chokidar from 'chokidar';
import fs from 'fs/promises';
import path from 'path';

export let activeWindowContext = "Unknown";
export let clipboardContext = "Empty";

export function startContextMonitors() {
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
}

export function startProactiveAgency(broadcastMsg) {
    setInterval(async () => {
        const script = `Get-WinEvent -FilterHashtable @{LogName='Application'; Level=2; StartTime=(Get-Date).AddMinutes(-5)} -MaxEvents 2 -ErrorAction SilentlyContinue | Select-Object Message | ConvertTo-Json`;
        
        exec(`powershell -NoProfile -Command "${script}"`, async (error, stdout) => {
            if (!error && stdout && stdout.trim().length > 5) {
                try {
                    const logs = JSON.parse(stdout);
                    const logMsgs = Array.isArray(logs) ? logs.map(l => l.Message).join(' | ') : logs.Message;
                    
                    if (GEMINI_API_KEY) {
                        const prompt = `You are JARVIS, an AI assistant running on a Windows PC. You proactively monitor the system. You just detected these critical application errors in the background:\n${logMsgs}\nWrite a short, conversational alert to the user warning them about this. Keep it under 2 sentences.`;
                        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
                        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
                        const result = await model.generateContent(prompt);
                        const alertText = result.response.text();
                        
                        broadcastMsg({ type: 'PROACTIVE_MSG', data: alertText });
                    }
                } catch(e) {}
            }
        });

        // Entra ID Security Monitor Check
        const entraScriptPath = path.join(process.cwd(), 'scripts', 'check_entra_risk.ps1');
        exec(`powershell -NoProfile -ExecutionPolicy Bypass -File "${entraScriptPath}"`, async (error, stdout) => {
            if (!error && stdout && stdout.trim().length > 5) {
                try {
                    if (GEMINI_API_KEY) {
                        const prompt = `You are JARVIS. You act as an autonomous cloud security monitor. You just detected these failed or risky sign-ins in your Entra ID environment:\n${stdout.trim()}\nWrite a short, urgent conversational alert to the user warning them about this activity. Include the IP and User. Keep it under 3 sentences.`;
                        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
                        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
                        const result = await model.generateContent(prompt);
                        const alertText = result.response.text();
                        
                        broadcastMsg({ type: 'PROACTIVE_MSG', data: `🚨 [ENTRA SECURITY ALERT]\n${alertText}` });
                    }
                } catch(e) {}
            }
        });
    }, 5 * 60 * 1000);
}

export function setupAutonomousSensors() {
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

    const downloadsFolder = path.join(process.env.USERPROFILE || process.env.HOME, 'Downloads');
    fs.access(downloadsFolder).then(() => {
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
    }).catch(() => {});
}

export async function getPcDiagnostics() {
    const [cpu, mem, disk] = await Promise.all([si.currentLoad(), si.mem(), si.fsSize()]);
    const mainDisk = disk.find(d => d.mount === 'C:') || disk[0];
    return {
        cpu: Math.round(cpu.currentLoad),
        memory: Math.round((mem.active / mem.total) * 100),
        disk: mainDisk ? Math.round(mainDisk.use) : 0
    };
}
