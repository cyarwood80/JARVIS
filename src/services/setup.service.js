import fs from 'fs/promises';
import path from 'path';
import { input, select, confirm } from '@inquirer/prompts';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { exec } from 'child_process';
import { ROOT_DIR, setAgentName } from '../config.js';
import { getHardwareProfile } from './hardware.service.js';

export async function initializeAgentIdentity() {
    const vaultDir = path.join(ROOT_DIR, 'vault');
    const configPath = path.join(vaultDir, 'agent_config.json');
    const envPath = path.join(ROOT_DIR, '.env');
    const fleetPath = path.join(vaultDir, 'fleet_config.json');

    try { await fs.access(vaultDir); } catch { await fs.mkdir(vaultDir, { recursive: true }); }

    // Check if fully set up
    try {
        const data = await fs.readFile(configPath, 'utf8');
        const config = JSON.parse(data);
        if (config.agentName) {
            setAgentName(config.agentName);
            // If fleet config exists, we don't need to do onboarding again unless forced
            const hasFleet = await fs.access(fleetPath).then(() => true).catch(() => false);
            if (hasFleet) return config.agentName;
        }
    } catch {}

    console.clear();
    console.log(`\n\x1b[35m[SYSTEM BOOT]\x1b[0m Welcome to the Autonomous Agent Hub.\n`);
    
    // --- Phase 1: Identity & API Key ---
    const newName = await input({ 
        message: 'Please name your AI Agent:',
        default: 'ARGUS'
    });
    
    await fs.writeFile(configPath, JSON.stringify({ agentName: newName }, null, 2), 'utf8');
    setAgentName(newName);
    
    let geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey || geminiKey.trim() === '') {
        console.log(`\n\x1b[33m[NOTICE]\x1b[0m ${newName} requires a Google Gemini API Key to orchestrate the local models and act as a cloud fallback.`);
        geminiKey = await input({ message: 'Enter your Gemini API Key:' });
        
        let envContent = '';
        try { envContent = await fs.readFile(envPath, 'utf8'); } catch {}
        envContent += `\nGEMINI_API_KEY=${geminiKey}\n`;
        await fs.writeFile(envPath, envContent.trim(), 'utf8');
        process.env.GEMINI_API_KEY = geminiKey;
    }

    // --- Phase 2: Information Gathering ---
    console.log(`\n\x1b[36m[Profiling Hardware]\x1b[0m Scanning system resources...`);
    const profile = await getHardwareProfile();
    console.log(`  - CPU: ${profile.cpuBrand}\n  - RAM: ${profile.ramGB} GB\n  - VRAM: ${profile.vramGB} GB`);

    console.log(`\x1b[36m[Scanning Local Assets]\x1b[0m Checking Ollama...`);
    let installedModels = [];
    try {
        const { OLLAMA_URL } = await import('../config.js');
        const res = await fetch(`${OLLAMA_URL}/api/tags`);
        if (res.ok) {
            const data = await res.json();
            installedModels = data.models.map(m => m.name);
        }
    } catch {
        console.log(`\x1b[31m[!] Cannot connect to Ollama. Ensure Ollama is running.\x1b[0m\n`);
    }

    if (installedModels.length > 0) {
        console.log(`  - Found: ${installedModels.join(', ')}\n`);
    } else {
        console.log(`  - Found: None\n`);
    }

    const goalPreset = await select({
        message: `What is your primary goal for ${newName}?`,
        choices: [
            { name: 'Heavy Coding & Autonomous Scripting', value: 'Coding & Scripts' },
            { name: 'Complex Reasoning & Deep Research', value: 'Research & Reasoning' },
            { name: 'Fast General Assistance', value: 'Fast General Chat' },
            { name: 'The Ultimate All-Rounder', value: 'All-Rounder' },
            { name: 'Custom (Type your own)', value: 'custom' }
        ]
    });

    let userGoal = goalPreset;
    if (goalPreset === 'custom') {
        userGoal = await input({ message: 'Describe what you want to use this agent for:' });
    }

    // --- Phase 3: Gemini Orchestration ---
    await negotiateFleet(geminiKey, profile, installedModels, userGoal, fleetPath, newName);

    return newName;
}

async function negotiateFleet(geminiKey, profile, installedModels, userGoal, fleetPath, agentName) {
    const genAI = new GoogleGenerativeAI(geminiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    let currentPrompt = `You are a Senior AI Hardware Architect. Your job is to curate the absolute best 3-model local AI fleet for a user running Ollama.
The fleet must contain EXACTLY three roles:
1. "planner": The heavy, intelligent system router (best for coding/logic).
2. "synthesiser": The creative/reasoning model (best for writing/summarising).
3. "chat": The extremely fast, lightweight fallback model (for quick casual chat).

USER HARDWARE:
- RAM: ${profile.ramGB} GB
- VRAM: ${profile.vramGB} GB

ALREADY INSTALLED MODELS:
[${installedModels.join(', ')}]

USER'S PRIMARY GOAL:
"${userGoal}"

INSTRUCTIONS:
1. Select exactly 3 specific Ollama model tags (e.g. "qwen2.5:32b", "gemma2:9b", "llama3.1:8b").
2. DO NOT exceed the user's physical RAM limit. The combined sizes are fine, but NO SINGLE MODEL should exceed the user's total RAM.
3. If they already have an excellent model installed for a role, USE IT! Respect their existing downloads if they fit the goal.
4. If their hardware is high-end, give them the best possible models. If low-end, give them lightweight models.

Return STRICTLY raw JSON in the following format (no markdown, no backticks):
[
  {"role": "planner", "model": "model_tag_here", "reason": "Why this is the best choice..."},
  {"role": "synthesiser", "model": "model_tag_here", "reason": "Why this is the best choice..."},
  {"role": "chat", "model": "model_tag_here", "reason": "Why this is the best choice..."}
]`;

    let userFeedback = "";
    let finalFleet = null;

    while (!finalFleet) {
        console.log(`\n\x1b[36m[Cloud Orchestration]\x1b[0m ${userFeedback ? 'Re-negotiating' : 'Consulting'} with Gemini for the optimal fleet...`);
        
        const fullPrompt = userFeedback ? currentPrompt + `\n\nUSER FEEDBACK ON PREVIOUS SUGGESTION:\n"${userFeedback}"\n\nAdjust your JSON response to accommodate this feedback.` : currentPrompt;

        try {
            const result = await model.generateContent(fullPrompt);
            let text = result.response.text().trim();
            text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
            
            const fleet = JSON.parse(text);

            console.log(`\n\x1b[32m=== Recommended Fleet Roster ===\x1b[0m`);
            fleet.forEach(f => {
                const isInstalled = installedModels.includes(f.model);
                console.log(`\x1b[1mRole:\x1b[0m ${f.role.toUpperCase()}`);
                console.log(`\x1b[1mModel:\x1b[0m \x1b[36m${f.model}\x1b[0m ${isInstalled ? '\x1b[32m(Already Installed)\x1b[0m' : '\x1b[33m(Needs Download)\x1b[0m'}`);
                console.log(`\x1b[1mReason:\x1b[0m ${f.reason}\n`);
            });

            const action = await select({
                message: `Do you accept this fleet configuration for ${agentName}?`,
                choices: [
                    { name: 'Yes, Accept and Provision', value: 'accept' },
                    { name: 'No, Suggest Changes', value: 'suggest' }
                ]
            });

            if (action === 'accept') {
                finalFleet = fleet;
            } else {
                userFeedback = await input({ message: 'What would you like to change? (e.g., "I want a smaller model for chat")' });
            }

        } catch (e) {
            console.error(`\x1b[31m[!] Gemini Orchestration Failed:\x1b[0m`, e.message);
            // Fallback to static if cloud fails
            finalFleet = [
                { role: "planner", model: profile.recommendations.planner },
                { role: "synthesiser", model: profile.recommendations.synthesiser },
                { role: "chat", model: profile.recommendations.chat }
            ];
            console.log("\x1b[33mUsing fallback static recommendations.\x1b[0m");
        }
    }

    // Save fleet configuration
    const configObj = {};
    const modelsToPull = [];
    finalFleet.forEach(f => {
        configObj[f.role] = f.model;
        if (!installedModels.includes(f.model)) {
            modelsToPull.push(f.model);
        }
    });

    await fs.writeFile(fleetPath, JSON.stringify(configObj, null, 2), 'utf8');

    // Provisioning
    if (modelsToPull.length > 0) {
        console.log(`\n\x1b[36m[Auto-Provisioning]\x1b[0m Downloading ${modelsToPull.length} missing models via Ollama. This may take a while...\n`);
        for (const model of modelsToPull) {
            console.log(`>>> Pulling ${model}...`);
            await new Promise((resolve) => {
                const child = exec(`ollama pull ${model}`);
                child.stdout.pipe(process.stdout);
                child.stderr.pipe(process.stderr);
                child.on('exit', resolve);
            });
        }
        console.log(`\n\x1b[32m[Downloads Complete]\x1b[0m All optimal models installed!\n`);
    } else {
        console.log(`\n\x1b[32m[Optimal Models]\x1b[0m All required models are already installed.\n`);
    }
}
