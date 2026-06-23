import { exec } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import { search, SafeSearchType } from 'duck-duck-scrape';
import notifier from 'node-notifier';
import puppeteer from 'puppeteer';
import { ROOT_DIR, PORT } from '../config.js';
import { manageMemoryAction } from '../services/memory.service.js';
import { getPcDiagnostics } from '../services/system.service.js';

async function fileExists(filePath) {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

async function getApprovedCommands() {
    const vaultDir = path.join(ROOT_DIR, 'vault');
    if (!(await fileExists(vaultDir))) await fs.mkdir(vaultDir, { recursive: true });
    
    const whitelistPath = path.join(vaultDir, 'approved_commands.json');
    if (await fileExists(whitelistPath)) {
        try {
            const data = await fs.readFile(whitelistPath, 'utf8');
            return JSON.parse(data);
        } catch {
            return [];
        }
    }
    return [];
}

async function addApprovedCommand(command) {
    const whitelistPath = path.join(ROOT_DIR, 'vault', 'approved_commands.json');
    const cmds = await getApprovedCommands();
    if (!cmds.includes(command)) {
        cmds.push(command);
        await fs.writeFile(whitelistPath, JSON.stringify(cmds, null, 2), 'utf8');
    }
}

export async function executeTool(name, args, chatHistory, broadcastMsg) {
    console.log(`[TOOL CALLED] ${name}`, args);

    if (name === 'get_pc_diagnostics') {
        const stats = await getPcDiagnostics();
        return `CPU Usage: ${stats.cpu}%, Memory Usage: ${stats.memory}%, Disk Usage: ${stats.disk}%`;
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
        const scriptsDir = path.join(ROOT_DIR, 'scripts');
        if (!(await fileExists(scriptsDir))) await fs.mkdir(scriptsDir);
        
        let filename = args.scriptName;
        if (!filename.endsWith('.ps1') && !filename.endsWith('.js')) {
            filename += '.ps1';
        }
        const scriptPath = path.join(scriptsDir, filename);
        
        const targetDir = path.dirname(scriptPath);
        if (!(await fileExists(targetDir))) await fs.mkdir(targetDir, { recursive: true });
        
        await fs.writeFile(scriptPath, args.code, 'utf8');
        
        const metaPath = path.join(scriptsDir, 'meta.json');
        let meta = {};
        if (await fileExists(metaPath)) {
            meta = JSON.parse(await fs.readFile(metaPath, 'utf8'));
        }
        meta[filename] = args.description || 'Created by Jarvis';
        await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf8');

        return `Successfully saved script: ${filename} to the Automation Vault.`;
    }

    if (name === 'run_saved_script') {
        const scriptsDir = path.join(ROOT_DIR, 'scripts');
        const scriptPath = path.join(scriptsDir, args.scriptName);
        if (!(await fileExists(scriptPath))) {
            return `Error: Script '${args.scriptName}' does not exist in the Automation Vault.`;
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
        const scriptsDir = path.join(ROOT_DIR, 'scripts');
        if (!(await fileExists(scriptsDir))) return "The Automation Vault is empty.";
        const files = (await fs.readdir(scriptsDir)).filter(f => f.endsWith('.ps1') || f.endsWith('.js'));
        if (files.length === 0) return "The Automation Vault is empty.";
        return `Available scripts:\n` + files.map(f => `- ${f}`).join('\n');
    }

    if (name === 'search_web') {
        try {
            const results = await search(args.query, { safeSearch: SafeSearchType.MODERATE });
            if (!results.results || results.results.length === 0) {
                return `No web search results found for: ${args.query}`;
            }
            const topResults = results.results.slice(0, 3).map(r => 
                `TITLE: ${r.title}\nURL: ${r.url}\nSUMMARY: ${r.description}\n`
            ).join('\n---\n');
            return `Web Search Results for "${args.query}":\n\n${topResults}`;
        } catch (err) {
            return `Web search failed: ${err.message}`;
        }
    }

    if (name === 'browse_website') {
        let browser;
        try {
            const isHeadless = args.visible !== true;
            if (broadcastMsg) broadcastMsg({ type: 'log', message: `[Browser] Launching ${isHeadless ? 'headless ' : ''}Chromium for ${args.url}...` });
            
            browser = await puppeteer.launch({ 
                headless: isHeadless,
                defaultViewport: null,
                args: ['--start-maximized', '--no-sandbox']
            });
            const page = await browser.newPage();
            await page.goto(args.url, { waitUntil: 'networkidle2', timeout: 30000 });
            
            // If they made it visible, they probably want to see it for a few seconds even if it's just scraping
            if (!isHeadless) await new Promise(r => setTimeout(r, 4000));
            
            const text = await page.evaluate(() => document.body.innerText);
            // Clean up massive whitespace and limit to 8000 characters to prevent context window explosion
            const cleanedText = text.replace(/[\r\n]+/g, '\n').replace(/\s{2,}/g, ' ').substring(0, 8000);
            
            await browser.close();
            return `Extracted text from ${args.url}:\n\n${cleanedText}...`;
        } catch (err) {
            if (browser) await browser.close();
            return `Failed to browse website: ${err.message}`;
        }
    }

    if (name === 'manage_memory') {
        return await manageMemoryAction(args.action, args.fact);
    }

    if (name === 'execute_command') {
        const commandStr = args.command;
        const approvedCmds = await getApprovedCommands();
        const isApproved = approvedCmds.includes(commandStr);
        
        const READ_ONLY_PREFIXES = ['ipconfig', 'ping', 'dir', 'ls', 'echo', 'whoami', 'get-', 'systeminfo', 'netstat', 'tasklist', 'tree'];
        const isReadOnly = READ_ONLY_PREFIXES.some(prefix => commandStr.toLowerCase().startsWith(prefix));
        
        if (!isApproved && !isReadOnly) {
            const lastMsg = chatHistory[chatHistory.length - 1]?.content?.toLowerCase() || "";
            const GRANT_WORDS = ['yes', 'approve', 'proceed', 'permission', 'granted', 'go ahead', 'do it', 'run it', 'ok', 'sure', 'fine', 'authorized', 'authorise'];
            const permissionGranted = GRANT_WORDS.some(w => lastMsg.includes(w));
            
            if (!permissionGranted) {
                return `SECURITY BLOCK: Command '${commandStr}' is unapproved. You MUST ask the user for explicit permission to run it, and ask if they want to whitelist it.`;
            }
            
            // If we have permission, check if they wanted to whitelist it
            if (lastMsg.includes('whitelist') || lastMsg.includes('remember') || lastMsg.includes('always')) {
                await addApprovedCommand(commandStr);
                if (broadcastMsg) broadcastMsg({ type: 'log', message: `\u2705 Command added to approved whitelist.` });
            }
        }

        return new Promise(async (resolve) => {
            const tmpFile = path.join(ROOT_DIR, `_jarvis_tmp_${Date.now()}.ps1`);
            await fs.writeFile(tmpFile, commandStr, 'utf8');
            exec(`powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${tmpFile}"`,
                { timeout: 15000 },
                async (err, stdout, stderr) => {
                    try { await fs.unlink(tmpFile); } catch (_) {}
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
                else resolve('Failed to send WhatsApp push message. OpenClaw might be disconnected.');
            } catch (e) {
                resolve(`WhatsApp push error: ${e.message}`);
            }
        });
    }

    if (name === 'voice_alert') {
        if (broadcastMsg) broadcastMsg({ type: 'log', message: `[Voice Alert] ${args.message}` });
        if (broadcastMsg) broadcastMsg({ type: 'speak', text: args.message });
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
