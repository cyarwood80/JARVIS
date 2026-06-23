import fs from 'fs/promises';
import path from 'path';
import { ROOT_DIR, OLLAMA_URL } from '../config.js';
import { getBestLocalModel } from './ai.service.js';

const RAG_STORE_PATH = path.join(ROOT_DIR, 'vault', 'rag_memory.json');

// Helper: Cosine Similarity
function cosineSimilarity(vecA, vecB) {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Helper: Get Embedding from Ollama
async function getEmbedding(text) {
    // We use the planner model as it's usually the most robust local model available
    const model = getBestLocalModel('planner');
    const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: model, prompt: text, keep_alive: '2h' })
    });
    if (!res.ok) throw new Error(`Ollama embedding failed: ${res.statusText}`);
    const data = await res.json();
    return data.embedding;
}

// Load Store
async function loadStore() {
    try {
        const data = await fs.readFile(RAG_STORE_PATH, 'utf-8');
        return JSON.parse(data);
    } catch {
        return []; // Array of { text, embedding, timestamp }
    }
}

// Save Store
async function saveStore(store) {
    await fs.mkdir(path.dirname(RAG_STORE_PATH), { recursive: true });
    await fs.writeFile(RAG_STORE_PATH, JSON.stringify(store, null, 2), 'utf-8');
}

/**
 * Adds a new memory to the RAG vector store.
 */
export async function addRagMemory(text) {
    try {
        const embedding = await getEmbedding(text);
        const store = await loadStore();
        store.push({
            text,
            embedding,
            timestamp: new Date().toISOString()
        });
        await saveStore(store);
        return true;
    } catch (err) {
        console.error('[RAG] Failed to add memory:', err.message);
        return false;
    }
}

/**
 * Searches the RAG vector store for relevant memories.
 */
export async function searchRagMemory(query, topK = 3) {
    try {
        const store = await loadStore();
        if (store.length === 0) return [];

        const queryEmbedding = await getEmbedding(query);
        
        // Calculate similarities
        const results = store.map(item => ({
            text: item.text,
            timestamp: item.timestamp,
            score: cosineSimilarity(queryEmbedding, item.embedding)
        }));

        // Sort descending by score
        results.sort((a, b) => b.score - a.score);
        
        // Return top K
        return results.slice(0, topK);
    } catch (err) {
        console.error('[RAG] Search failed:', err.message);
        return [];
    }
}
