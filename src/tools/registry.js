export const openAiTools = [
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
            description: "Returns the current CPU, RAM, and Disk hardware usage percentages.",
            parameters: { type: "object", properties: {}, required: [] }
        }
    },
    {
        type: "function",
        function: {
            name: "execute_command",
            description: "Executes a Windows PowerShell command. Use this to manage files, interact with the OS, query system info, event logs, user sessions, network status, or any system state.",
            parameters: {
                type: "object",
                properties: { command: { type: "string" } },
                required: ["command"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "browse_website",
            description: "Uses a full Chromium browser to navigate to a URL and extract the page text. Crucial for heavily dynamic or Javascript-rendered websites. Supports a 'visible' boolean parameter: if true, the browser opens visibly on the user's screen; if false, it runs silently in the background.",
            parameters: {
                type: "object",
                properties: { 
                    url: { type: "string", description: "The full URL to browse to." },
                    visible: { type: "boolean", description: "Set to true to make the browser visible on the user's desktop, false for headless mode." }
                },
                required: ["url", "visible"]
            }
        }
    }
];
