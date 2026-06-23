# Autonomous AI Hub

A fully dynamic, hybrid local/cloud AI gateway that connects a WhatsApp mobile interface (OpenClaw) to a highly capable, self-aware AI agent running natively on your Windows PC.

## Dynamic Identity
Unlike hardcoded systems, this Hub allows you to dynamically name your Agent (e.g., **ARGUS**). This name is natively injected into the massive LLM System Prompts, serves as the custom wake word for the WhatsApp gateway, and dynamically brands the Local Web Dashboard.

## The Architecture
The Agent acts as an intelligent router and executor. When you send a message via WhatsApp, the OpenClaw gateway catches it and forwards it to the Hub. 

The Hub uses a **3-Stage Cognitive Pipeline**:
1. **The Planner:** Analyzes the user's intent. It decides whether the request requires executing a tool (like running a PowerShell command) or if it can be answered directly. It then outputs a strict JSON execution plan.
2. **The Local Executor:** If a tool is required, the Agent executes it natively on the Windows PC (e.g., querying the OS, reading files, formatting drives). If no tool is required, it routes the prompt directly to a local specialist model.
3. **The Synthesiser:** If a tool was executed, the raw, messy terminal output is sent to the Synthesiser, which writes a clean, conversational response back to you.

## Self-Awareness & Autonomy
This system has been upgraded beyond a reactive CLI wrapper:
- **Environmental Awareness:** The Agent continuously polls your currently active foreground window and your system clipboard. When you ask questions, it inherently knows what you are looking at.
- **Autonomous ReAct Loop:** If a local PowerShell command fails, the Agent intercepts the error and feeds it back into the Planner to autonomously rewrite the code and try again.
- **Proactive Agency:** A 5-minute background polling loop silently monitors your Windows Application Event Logs. If it detects a critical error, the Agent will proactively reach out and speak to you over the UI.
- **Memory Consolidation (Sleep Cycle):** After 10 minutes of idle time, the Agent reads its raw memory vault, deduplicates the facts using a heavy reasoning model, and rewrites it into a clean Markdown Knowledge Graph.
- **Piper AI Voice:** Real-time, ultra-fast, high-fidelity local TTS using Piper AI.

## Cloud-Orchestrated Provisioning
You do not need to guess which AI models to install. 
Upon first boot, the **Intelligent Onboarding Wizard** will:
1. Scan your PC's Physical RAM and VRAM.
2. Check your locally installed Ollama models.
3. Ask for your primary use-case (e.g., Heavy Coding vs. Fast Chat).
4. Send this profile to **Gemini 2.5 Flash** (The Cloud Orchestrator), which acts as an AI Hardware Architect.
5. Gemini will curate a bespoke, 3-model fleet specifically for your rig. You can negotiate changes with Gemini in real-time via the CLI.
6. The system will automatically download the final models via `ollama pull`.

## Getting Started
Please read the [SETUP.md](./SETUP.md) for a step-by-step visual guide on installing and running the system.
