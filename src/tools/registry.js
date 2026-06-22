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
    }
];
