import si from 'systeminformation';
import readline from 'readline';
import { exec } from 'child_process';

export let systemHardwareProfile = null;

export async function getHardwareProfile() {
    const [cpu, mem, graphics] = await Promise.all([si.cpu(), si.mem(), si.graphics()]);
    
    const ramGB = Math.round(mem.total / (1024 ** 3));
    
    let vramGB = 0;
    if (graphics.controllers && graphics.controllers.length > 0) {
        for (const gpu of graphics.controllers) {
            if (gpu.vram) {
                vramGB += Math.round(gpu.vram / 1024);
            }
        }
    }

    let tier = 'C';
    let recommendations = {
        planner: 'qwen2.5:7b',
        synthesiser: 'gemma2:2b',
        chat: 'qwen2.5:1.5b'
    };

    // Tier A: High-End Desktop
    if (ramGB >= 30 || (ramGB >= 24 && vramGB >= 10)) {
        tier = 'A';
        recommendations = {
            planner: 'qwen2.5:32b',
            synthesiser: 'gemma2:27b',
            chat: 'llama3.1:8b'
        };
    // Tier B: Mid-Range / Modern Laptop
    } else if (ramGB >= 15 || vramGB >= 6) {
        tier = 'B';
        recommendations = {
            planner: 'qwen2.5:14b',
            synthesiser: 'gemma2:9b',
            chat: 'llama3.2:3b'
        };
    }

    return {
        cpuBrand: cpu.brand,
        ramGB,
        vramGB,
        tier,
        recommendations
    };
}

export async function checkAndPromptModels() {
    const profile = await getHardwareProfile();
    systemHardwareProfile = profile;
    
    console.log(`\n\x1b[36m[Hardware Scan]\x1b[0m CPU: ${profile.cpuBrand} | RAM: ${profile.ramGB}GB | VRAM: ${profile.vramGB}GB`);
    console.log(`\x1b[36m[Hardware Scan]\x1b[0m Assigned Rig Tier: \x1b[1m${profile.tier}\x1b[0m`);

    const { OLLAMA_URL } = await import('../config.js');
    let installedModels = [];
    try {
        const res = await fetch(`${OLLAMA_URL}/api/tags`);
        if (res.ok) {
            const data = await res.json();
            installedModels = data.models.map(m => m.name);
        }
    } catch {
        console.log(`\x1b[31m[!] Cannot connect to Ollama. Ensure Ollama is running.\x1b[0m\n`);
        return profile;
    }

    const recs = profile.recommendations;
    const missingModels = [];
    
    // Check if any variant of the recommended model exists
    if (!installedModels.some(m => m.includes(recs.planner.split(':')[0]))) missingModels.push(recs.planner);
    if (!installedModels.some(m => m.includes(recs.synthesiser.split(':')[0]))) missingModels.push(recs.synthesiser);
    if (!installedModels.some(m => m.includes(recs.chat.split(':')[0]))) missingModels.push(recs.chat);

    if (missingModels.length > 0) {
        console.log(`\n\x1b[33m[Optimal Models Missing]\x1b[0m JARVIS recommends the following models for your hardware:`);
        missingModels.forEach(m => console.log(` - ${m}`));
        
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        const answer = await new Promise(resolve => rl.question(`\nWould you like JARVIS to automatically download these models now? (y/N): `, resolve));
        rl.close();

        if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
            console.log(`\n\x1b[36m[Downloading Models]\x1b[0m Please wait, this may take a while depending on your internet connection...`);
            for (const model of missingModels) {
                console.log(`\n>>> Pulling ${model}...`);
                await new Promise((resolve) => {
                    const child = exec(`ollama pull ${model}`);
                    child.stdout.pipe(process.stdout);
                    child.stderr.pipe(process.stderr);
                    child.on('exit', resolve);
                });
            }
            console.log(`\n\x1b[32m[Downloads Complete]\x1b[0m All optimal models installed!\n`);
        }
    } else {
        console.log(`\x1b[32m[Optimal Models]\x1b[0m All recommended models for your hardware are installed.\n`);
    }

    return profile;
}
