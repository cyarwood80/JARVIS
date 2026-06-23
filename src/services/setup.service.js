import fs from 'fs/promises';
import path from 'path';
import readline from 'readline';
import { ROOT_DIR, setAgentName } from '../config.js';

export async function initializeAgentIdentity() {
    const vaultDir = path.join(ROOT_DIR, 'vault');
    const configPath = path.join(vaultDir, 'agent_config.json');

    try {
        await fs.access(vaultDir);
    } catch {
        await fs.mkdir(vaultDir, { recursive: true });
    }

    try {
        const data = await fs.readFile(configPath, 'utf8');
        const config = JSON.parse(data);
        if (config.agentName) {
            setAgentName(config.agentName);
            return config.agentName;
        }
    } catch {
        // File doesn't exist or is invalid, prompt user
    }

    console.log(`\n\x1b[35m[SYSTEM BOOT]\x1b[0m Welcome to the Autonomous Agent Hub.`);
    
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    const answer = await new Promise(resolve => {
        rl.question(`\x1b[36mPlease name your AI Agent (Suggestion: ARGUS):\x1b[0m `, resolve);
    });
    rl.close();

    const newName = answer.trim() || 'ARGUS';
    
    await fs.writeFile(configPath, JSON.stringify({ agentName: newName }, null, 2), 'utf8');
    setAgentName(newName);
    
    console.log(`\n\x1b[32m[IDENTITY SAVED]\x1b[0m Agent identity set to: \x1b[1m${newName}\x1b[0m\n`);
    return newName;
}
