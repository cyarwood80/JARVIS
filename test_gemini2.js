import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config({ path: 'c:/Users/chris/.gemini/antigravity-ide/scratch/jarvis-ai/.env' });

const geminiTools = {
    functionDeclarations: [
        {
            name: "open_application",
            description: "Opens a Windows graphical application.",
            parameters: { type: "object", properties: { appName: { type: "string" } }, required: ["appName"] }
        },
        {
            name: "get_pc_diagnostics",
            description: "Returns CPU, RAM, and Disk usage.",
            parameters: { type: "object", properties: {} }
        },
        {
            name: "execute_command",
            description: "Executes a raw Windows CMD command.",
            parameters: { type: "object", properties: { command: { type: "string" } }, required: ["command"] }
        }
    ]
};

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-flash-latest", tools: [geminiTools] });

async function test() {
    try {
        const chat = model.startChat({ history: [] });
        const result = await chat.sendMessage("Jarvis who last logged on to my pc?");
        console.log("Success! Function call:", result.response.functionCalls());
    } catch (e) {
        console.error("Error:", e.message);
        console.error(e.stack);
    }
}
test();
