import dotenv from 'dotenv';
dotenv.config({ path: 'c:/Users/chris/.gemini/antigravity-ide/scratch/jarvis-ai/.env' });

async function test() {
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`);
        const data = await response.json();
        console.log("Models:", data.models.map(m => m.name).join(", "));
    } catch (e) {
        console.error("Error:", e.message);
    }
}
test();
