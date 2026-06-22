

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
            description: "Returns the current CPU, RAM, and Disk usage of the host PC.",
            parameters: { type: "object", properties: {}, required: [] }
        }
    },
    {
        type: "function",
        function: {
            name: "execute_command",
            description: "Executes a raw Windows CMD command to manage files or the OS.",
            parameters: {
                type: "object",
                properties: { command: { type: "string" } },
                required: ["command"]
            }
        }
    }
];

async function test() {
    try {
        const ollamaRes = await fetch(`http://127.0.0.1:11434/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'hermes3',
                messages: [
                    { role: "system", content: "You are Jarvis." },
                    { role: "user", content: "Jarvis who last logged on to my pc?" }
                ],
                tools: openAiTools,
                stream: false
            })
        });
        
        if (!ollamaRes.ok) {
            const err = await ollamaRes.text();
            console.error("HTTP ERROR:", ollamaRes.status, err);
        } else {
            const data = await ollamaRes.json();
            console.log("SUCCESS:", JSON.stringify(data, null, 2));
        }
    } catch (e) {
        console.error("FETCH ERROR:", e);
    }
}
test();
