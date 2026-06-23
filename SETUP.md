# Setup & Onboarding Guide

Welcome to the Autonomous AI Hub! This guide will walk you through the dynamic setup process.

## Prerequisites
Before you begin, ensure you have the following installed on your Windows PC:
- **Node.js** (v18 or higher)
- **Ollama** (Running in the background)
- A **Google Gemini API Key** (for Cloud Orchestration)

## Step 1: Install Dependencies
Open a PowerShell or Command Prompt window in the project directory and run:
```bash
npm install
```

## Step 2: Launch the Onboarding Wizard
To start the Hub for the first time, simply run:
```bash
npm start
```
The system will detect that it is unconfigured and will pause the boot sequence to launch the **Intelligent Onboarding Wizard**.

![CLI Setup Step 1](/C:/Users/chris/.gemini/antigravity-ide/brain/e055a7ee-d7cb-4ec1-9ffd-0e88bdb0d046/cli_setup_1_1782234305169.png)

## Step 3: Identity & API Key Provisioning
1. **Name your Agent:** You will be prompted to name your AI Agent (e.g., `ARGUS`). This name becomes its global identity and your WhatsApp wake word.
2. **Provide API Key:** If a Gemini API Key is not found in your `.env` file, the wizard will securely prompt you for it.

## Step 4: Hardware Profiling & Cloud Orchestration
The wizard will silently scan your PC's CPU, RAM, and VRAM. It will also query Ollama to detect any models you have already downloaded.

It will then ask you: **"What is your primary goal for this agent?"**
- Select from options like *Heavy Coding & Autonomous Scripting*, *Complex Reasoning*, *Fast Chat*, or type a *Custom* goal.

![CLI Setup Step 2](/C:/Users/chris/.gemini/antigravity-ide/brain/e055a7ee-d7cb-4ec1-9ffd-0e88bdb0d046/cli_setup_2_1782234315545.png)

## Step 5: The Gemini Fleet Negotiation
Your hardware profile and goals are sent to **Gemini 2.5 Flash** (The Cloud Orchestrator). 
Gemini will analyze your exact setup and return a curated list of the absolute best Ollama models currently available for your specific rig, assigning them to three strict roles:
- `planner`
- `synthesiser`
- `chat`

### Accept or Suggest Changes
You will be shown Gemini's logic. If you like the configuration, select **Accept**.
If you want something different (e.g., "I want a smaller model for chat"), select **Suggest Changes** and type your feedback. Gemini will instantly generate a revised fleet!

## Step 6: Auto-Provisioning
Once accepted, the wizard will automatically run `ollama pull` for any models you don't already have. 
When finished, the Local Web Dashboard and OpenClaw Gateway will boot up automatically.

You are now ready to go! Navigate to `http://localhost:3000` to view the dashboard.
