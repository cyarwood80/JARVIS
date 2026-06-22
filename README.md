# JARVIS AI Hub

JARVIS is a hybrid local/cloud AI gateway that connects a WhatsApp mobile interface (OpenClaw) to a highly capable, self-aware AI agent running on a Windows PC.

## The Architecture
JARVIS acts as an intelligent router and executor. When you send a message via WhatsApp, the OpenClaw gateway catches it and forwards it to JARVIS. 

JARVIS uses a **3-Stage Cognitive Pipeline**:
1. **The Planner (Gemini 2.5 Flash):** Analyzes the user's intent. It decides whether the request requires executing a tool (like running a PowerShell command) or if it can be answered directly. It then outputs a strict JSON execution plan.
2. **The Local Executor (Ollama):** If a tool is required, JARVIS executes it natively on the Windows PC (e.g., querying the OS, reading files, formatting drives). If no tool is required, it routes the prompt directly to a local specialist model (like `llama3.1:8b` for fast chat or `qwen2.5:32b` for code).
3. **The Synthesiser (Gemini 2.5 Flash):** If a tool was executed, the raw, messy terminal output is sent to the Synthesiser, which writes a clean, conversational response back to you.

## Self-Awareness Features
JARVIS has been upgraded beyond a reactive CLI wrapper:
- **Environmental Awareness:** Jarvis continuously polls your currently active foreground window and your system clipboard. When you ask questions, it inherently knows what you are looking at.
- **Autonomous ReAct Loop:** If a local PowerShell command fails, Jarvis intercepts the error and feeds it back into the Planner to autonomously rewrite the code and try again.
- **Proactive Agency:** A 5-minute background polling loop silently monitors your Windows Application Event Logs. If it detects a critical error, Jarvis will proactively reach out and speak to you over the UI.
- **Memory Consolidation (Sleep Cycle):** After 10 minutes of idle time, Jarvis reads its raw memory vault (`chris.md`), deduplicates the facts using a heavy reasoning model, and rewrites it into a clean Markdown Knowledge Graph.

## Model Fleet
- **`hermes3:latest`**: OS / System Executor (4.7 GB)
- **`qwen2.5:32b`**: Code Specialist (19 GB)
- **`gemma4:26b`**: Heavy Reasoning (17 GB)
- **`llama3.1:8b`**: Fast Chat (4.9 GB)
- **`llama3:8b-instruct-q8_0`**: Summariser (8.5 GB)

## Getting Started
1. Run `npm install`
2. Ensure Ollama is running locally with the models above installed.
3. Add your `GEMINI_API_KEY` to a `.env` file.
4. Run `npm start`. This will automatically boot both the Jarvis Web Dashboard and the OpenClaw WhatsApp Gateway.
5. Open `http://localhost:3000` to view the Telemetry dashboard and 3D Visualizer.
