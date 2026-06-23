import fs from 'fs/promises';
import path from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GEMINI_API_KEY, ROOT_DIR } from '../config.js';
import { searchRagMemory, addRagMemory } from './rag.service.js';

export let lastInteractionTime = Date.now();
let hasConsolidatedMemoryToday = false;

export function updateInteractionTime() {
    lastInteractionTime = Date.now();
}

async function fileExists(filePath) {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

export function startSleepCycle() {
    setInterval(async () => {
        const idleTime = Date.now() - lastInteractionTime;
        
        if (idleTime > 10 * 60 * 1000 && !hasConsolidatedMemoryToday && GEMINI_API_KEY) {
            const memPath = path.join(ROOT_DIR, 'vault', 'chris.md');
            if (await fileExists(memPath)) {
                try {
                    console.log("[SLEEP CYCLE] System idle. Initiating memory consolidation...");
                    const rawMemory = await fs.readFile(memPath, 'utf8');
                    if (!rawMemory.trim()) return;

                    const prompt = `You are JARVIS's background memory manager. Consolidate the following raw memory vault. 
Merge overlapping facts, delete duplicate lines, correct any conflicting information, and rewrite it as a beautifully clean, categorized Markdown Knowledge Graph. 
Do not add conversational text, just output the pure Markdown.
\n\nRAW MEMORY:\n${rawMemory}`;

                    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
                    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
                    const result = await model.generateContent(prompt);
                    
                    let cleanedMemory = result.response.text().trim();
                    cleanedMemory = cleanedMemory.replace(/^```(?:markdown)?\s*/i, '').replace(/\s*```$/, '').trim();
                    
                    await fs.writeFile(memPath, cleanedMemory, 'utf8');
                    console.log("[SLEEP CYCLE] Memory consolidation complete.");
                    
                    hasConsolidatedMemoryToday = true;
                    setTimeout(() => hasConsolidatedMemoryToday = false, 12 * 60 * 60 * 1000); // Reset after 12 hours
                } catch(e) {
                    console.error("[SLEEP CYCLE] Consolidation failed:", e.message);
                }
            }
        }
    }, 60 * 1000);
}

export async function getCoreMemory(messages = []) {
    const memPath = path.join(ROOT_DIR, 'vault', 'chris.md');
    let coreStr = '';
    if (await fileExists(memPath)) {
        const mem = await fs.readFile(memPath, 'utf8');
        if (mem) coreStr += `\n\n<LONG_TERM_MEMORY>\n${mem}\n</LONG_TERM_MEMORY>\n`;
    }

    if (messages && messages.length > 0) {
        const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')?.content || '';
        if (lastUserMsg) {
            const ragResults = await searchRagMemory(lastUserMsg, 3);
            if (ragResults && ragResults.length > 0) {
                const ragText = ragResults.map(r => `[${r.timestamp}] ${r.text}`).join('\n');
                coreStr += `\n<RELEVANT_PAST_MEMORIES>\n${ragText}\n</RELEVANT_PAST_MEMORIES>\n`;
            }
        }
    }
    return coreStr;
}

export async function manageMemoryAction(action, fact) {
    const vaultDir = path.join(ROOT_DIR, 'vault');
    if (!(await fileExists(vaultDir))) {
        await fs.mkdir(vaultDir, { recursive: true });
    }
    const memFile = path.join(vaultDir, 'chris.md');
    
    if (action === 'append') {
        const dateStr = new Date().toISOString().split('T')[0];
        const newFact = `- [${dateStr}] ${fact}\n`;
        await fs.appendFile(memFile, newFact, 'utf8');
        await addRagMemory(fact);
        return `Successfully remembered: ${fact}`;
    } else if (action === 'read' || action === 'search') {
        if (await fileExists(memFile)) return await fs.readFile(memFile, 'utf8') || "Memory is currently empty.";
        return "Memory is currently empty.";
    } else if (action === 'clear') {
        if (await fileExists(memFile)) await fs.writeFile(memFile, '', 'utf8');
        return "Memory cleared.";
    }
    return "Unknown memory action.";
}
