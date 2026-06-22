document.addEventListener('DOMContentLoaded', () => {

    // ══════════════════════════════════════════
    // NAV LOGIC
    // ══════════════════════════════════════════
    const navBtns = document.querySelectorAll('.nav-btn');
    const sections = document.querySelectorAll('.view-section');

    navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            navBtns.forEach(b => b.classList.remove('active'));
            sections.forEach(s => s.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(btn.dataset.target).classList.add('active');
            // Refresh views when tabs are opened
            if (btn.dataset.target === 'models-view') fetchModelWarmth();
            if (btn.dataset.target === 'vault-view') fetchScripts();
        });
    });

    // ══════════════════════════════════════════
    // PIPELINE STATUS CARD
    // Shows stage-by-stage progress during processing.
    // ══════════════════════════════════════════
    const statusCard = document.getElementById('pipeline-status-card');
    const statusIcon = document.getElementById('pipeline-status-icon');
    const statusText = document.getElementById('pipeline-status-text');
    const statusFill = document.getElementById('pipeline-status-fill');

    const STAGE_CONFIG = {
        thinking:    { icon: '⚡', text: 'Gemini is planning your request...', progress: '15%', color: '#f59e0b' },
        planned:     { icon: '🧠', text: null,  progress: '35%', color: '#8b5cf6' },   // text comes from WS message
        warming:     { icon: '🔥', text: null,  progress: '45%', color: '#f97316' },
        executing:   { icon: '🔧', text: null,  progress: '65%', color: '#06b6d4' },
        generating:  { icon: '💬', text: null,  progress: '75%', color: '#10b981' },
        synthesising:{ icon: '✨', text: 'Gemini is composing your answer...', progress: '90%', color: '#6366f1' },
        done:        { icon: '✅', text: '',     progress: '100%', color: '#10b981' },
        error:       { icon: '❌', text: null,  progress: '100%', color: '#ef4444' },
    };

    function showStatus(stage, message) {
        const config = STAGE_CONFIG[stage];
        if (!config) return;

        const displayText = message || config.text || stage;
        statusIcon.textContent = config.icon;
        statusText.textContent = displayText;
        statusFill.style.width = config.progress;
        statusFill.style.background = config.color;
        statusCard.style.borderColor = config.color + '66';
        statusCard.style.background = config.color + '11';

        if (stage === 'done') {
            // Brief "done" flash then hide
            statusCard.classList.remove('hidden');
            setTimeout(() => {
                statusCard.classList.add('hidden');
                const viz = document.getElementById('visualizer-sphere');
                if (viz) viz.className = 'jarvis-core';
            }, 1200);
        } else if (stage === 'error') {
            statusCard.classList.remove('hidden');
            setTimeout(() => {
                statusCard.classList.add('hidden');
                const viz = document.getElementById('visualizer-sphere');
                if (viz) viz.className = 'jarvis-core';
            }, 4000);
        } else {
            statusCard.classList.remove('hidden');
        }

        const viz = document.getElementById('visualizer-sphere');
        if (viz) {
            if (stage !== 'done' && stage !== 'idle') {
                viz.className = `jarvis-core ${stage}`;
            } else {
                viz.className = 'jarvis-core';
            }
        }
    }

    function hideStatus() {
        statusCard.classList.add('hidden');
        statusFill.style.width = '0%';
        const viz = document.getElementById('visualizer-sphere');
        if (viz) viz.className = 'jarvis-core';
    }

    // ══════════════════════════════════════════
    // CHAT LOGIC
    // ══════════════════════════════════════════
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');
    const chatHistory = document.getElementById('chat-history');
    const voiceBtn = document.getElementById('voice-btn');
    const arcReactor = document.getElementById('visualizer-sphere');
    const voiceWaves = document.getElementById('voice-waves');
    const ttsToggle = document.getElementById('tts-toggle');

    let isRecording = false;

    function appendMessage(text, sender, metadata) {
        const div = document.createElement('div');
        div.className = `message ${sender}-msg`;

        if (sender === 'jarvis' && metadata?.modelChain) {
            // Add model chain badge
            const badge = document.createElement('div');
            badge.className = 'model-chain-badge';
            badge.textContent = `via: ${metadata.modelChain}`;
            div.appendChild(badge);
        }

        // Render text (preserve line breaks)
        const textNode = document.createElement('div');
        textNode.className = 'message-text';
        textNode.textContent = text;
        div.appendChild(textNode);

        chatHistory.appendChild(div);
        chatHistory.scrollTop = chatHistory.scrollHeight;
        return div;
    }

    async function sendPrompt(promptText) {
        if (!promptText.trim()) return;
        appendMessage(promptText, 'user');
        chatInput.value = '';
        sendBtn.disabled = true;
        chatInput.disabled = true;

        // Create placeholder thinking bubble
        const thinkingDiv = document.createElement('div');
        thinkingDiv.className = 'message jarvis-msg thinking';
        thinkingDiv.innerHTML = '<span class="dot-flashing"></span>';
        chatHistory.appendChild(thinkingDiv);
        chatHistory.scrollTop = chatHistory.scrollHeight;

        try {
            const res = await fetch('/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages: [{ role: 'user', content: promptText }] })
            });

            const data = await res.json();

            // Replace thinking bubble with actual response
            thinkingDiv.remove();

            if (!res.ok || data.error) {
                appendMessage(`[Error] ${data.error || 'Request failed'}`, 'jarvis');
                return;
            }

            // Extract from OpenAI format
            const finalResponse = data.choices[0].message.content;
            const routeModel = data.model;
            const source = routeModel.includes('gemini') ? 'gemini' : 'local';

            appendMessage(finalResponse, 'jarvis', { modelChain: routeModel });

            // Update model indicator
            const modelIndicator = document.getElementById('model-indicator');
            const modelNameSpan = document.getElementById('model-name');
            modelIndicator.classList.remove('hidden', 'gemini', 'local');
            modelIndicator.classList.add(source);
            modelNameSpan.textContent = `Route: ${routeModel}`;

            // Show plan badge in console if plan is available
            if (data.plan) {
                const planDiv = document.createElement('div');
                planDiv.className = 'message plan-msg';
                planDiv.textContent = `🗂 Plan: "${data.plan.intent}" — tool: ${data.plan.tool || 'none'} — model: ${data.plan.local_model}`;
                chatHistory.appendChild(planDiv);
                chatHistory.scrollTop = chatHistory.scrollHeight;
            }

            // TTS
            if (ttsToggle.checked) {
                playWebTTS(data.response);
            }

            // Refresh warmth panel if visible
            const modelsView = document.getElementById('models-view');
            if (modelsView.classList.contains('active')) fetchModelWarmth();

        } catch (error) {
            thinkingDiv.remove();
            appendMessage(`[Connection Error] ${error.message}`, 'jarvis');
        } finally {
            sendBtn.disabled = false;
            chatInput.disabled = false;
            chatInput.focus();
            hideStatus();
        }
    }

    sendBtn.addEventListener('click', () => sendPrompt(chatInput.value));
    chatInput.addEventListener('keypress', e => { if (e.key === 'Enter') sendPrompt(chatInput.value); });

    // ══════════════════════════════════════════
    // PIPER AI VOICE (LOCAL TTS)
    // ══════════════════════════════════════════
    const voiceSelect = document.getElementById('voice-select');
    
    // We now use the local Piper AI model
    if (voiceSelect) {
        voiceSelect.innerHTML = '<option value="piper">en_US-lessac-high (Piper AI)</option>';
        voiceSelect.disabled = true; // Only one model available currently
    }

    let currentAudio = null;

    async function playWebTTS(text) {
        if (!text) return;
        
        // Stop any currently playing audio
        if (currentAudio) {
            currentAudio.pause();
            currentAudio.currentTime = 0;
            currentAudio = null;
        }

        if (arcReactor) arcReactor.classList.add('listening');

        try {
            const res = await fetch('/api/tts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text })
            });

            if (!res.ok) throw new Error('TTS failed on server');

            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            
            currentAudio = new Audio(url);
            currentAudio.onended = () => { 
                if (arcReactor) arcReactor.classList.remove('listening'); 
                URL.revokeObjectURL(url); 
            };
            currentAudio.onerror = () => { 
                if (arcReactor) arcReactor.classList.remove('listening'); 
                URL.revokeObjectURL(url); 
            };
            currentAudio.play();
            
        } catch (e) {
            console.error("Piper TTS Error:", e);
            if (arcReactor) arcReactor.classList.remove('listening');
        }
    }

    const testVoiceBtn = document.getElementById('test-voice-btn');
    if (testVoiceBtn) {
        testVoiceBtn.addEventListener('click', () => {
            playWebTTS("Systems online. This is my high fidelity local Piper AI voice module.");
        });
    }

    // ══════════════════════════════════════════
    // VOICE RECOGNITION (STT)
    // ══════════════════════════════════════════
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    let recognition;

    if (SpeechRecognition) {
        recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;

        recognition.onstart = () => {
            isRecording = true;
            voiceBtn.classList.add('recording');
            arcReactor.classList.add('listening');
            voiceWaves.classList.remove('hidden');
        };
        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            chatInput.value = transcript;
            sendPrompt(transcript);
        };
        recognition.onerror = () => stopRecordingUI();
        recognition.onend = () => stopRecordingUI();

        voiceBtn.addEventListener('click', () => {
            if (isRecording) recognition.stop();
            else recognition.start();
        });
    } else {
        voiceBtn.title = "Speech Recognition not supported in this browser.";
        voiceBtn.style.opacity = '0.5';
    }

    function stopRecordingUI() {
        isRecording = false;
        voiceBtn.classList.remove('recording');
        arcReactor.classList.remove('listening');
        voiceWaves.classList.add('hidden');
    }

    // ══════════════════════════════════════════
    // SYSTEM TELEMETRY
    // ══════════════════════════════════════════
    async function fetchStats() {
        try {
            const res = await fetch('/api/stats');
            if (res.ok) {
                const data = await res.json();
                document.getElementById('cpu-val').textContent = data.cpu;
                document.getElementById('cpu-bar').style.width = `${data.cpu}%`;
                document.getElementById('mem-val').textContent = data.memory;
                document.getElementById('mem-bar').style.width = `${data.memory}%`;
                document.getElementById('disk-val').textContent = data.disk;
                document.getElementById('disk-bar').style.width = `${data.disk}%`;
                
                if (data.metrics) {
                    renderTelemetry(data.metrics, data.registry);
                }
            }
        } catch (e) {}
    }
    
    function renderTelemetry(metrics, registry = {}) {
        document.getElementById('public-tokens-val').textContent = metrics.totalTokensPublic.toLocaleString();
        document.getElementById('local-tokens-val').textContent = metrics.totalTokensLocal.toLocaleString();
        
        const grid = document.getElementById('telemetry-models-grid');
        if (Object.keys(metrics.models).length === 0) {
            grid.innerHTML = '<div class="model-fleet-card loading"><div>Waiting for model executions...</div></div>';
            return;
        }
        
        grid.innerHTML = '';
        for (const [model, stats] of Object.entries(metrics.models)) {
            const avgLoadMs = Math.round((stats.totalLoadNs / stats.runs) / 1e6);
            const totalGenS = stats.totalGenNs / 1e9;
            const tps = totalGenS > 0 ? (stats.tokens / totalGenS).toFixed(1) : 0;
            const weight = registry[model]?.size || '? GB';
            
            const card = document.createElement('div');
            card.className = 'model-fleet-card warm';
            card.innerHTML = `
                <div class="model-fleet-header">
                    <span class="model-fleet-emoji">⚡</span>
                    <div class="model-warmth-badge warm">${stats.runs} Runs</div>
                </div>
                <div class="model-fleet-name">${model} <span style="font-size: 0.7em; color: var(--text-muted); font-weight: normal;">${weight}</span></div>
                <div class="model-fleet-role" style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-color); padding-bottom: 0.5rem; margin-bottom: 0.5rem;">
                    <span style="color: var(--primary-neon); font-weight: bold; font-family: var(--font-heading);">${tps} t/s</span>
                    <span>${stats.tokens.toLocaleString()} Tokens</span>
                </div>
                <div class="model-fleet-meta">
                    <span>Avg Load: ${avgLoadMs}ms</span>
                </div>
            `;
            grid.appendChild(card);
        }
    }

    setInterval(fetchStats, 3000);
    fetchStats();

    // ══════════════════════════════════════════
    // MODEL FLEET WARMTH DISPLAY
    // ══════════════════════════════════════════
    async function fetchModelWarmth() {
        try {
            const res = await fetch('/api/warmth');
            if (!res.ok) return;
            const warmth = await res.json();
            renderModelFleet(warmth);
        } catch (e) {}
    }

    function renderModelFleet(warmth) {
        const grid = document.getElementById('models-grid');
        grid.innerHTML = '';
        for (const [model, status] of Object.entries(warmth)) {
            const size = status.info?.size || '? GB';
            const role = status.info?.specialisms?.split(',')[0] || 'General Model';
            const emoji = '🤖'; 
            
            const card = document.createElement('div');
            card.className = `model-fleet-card ${status.warm ? 'warm' : 'cold'}`;
            const lastUsedText = status.lastUsed
                ? `Last used: ${new Date(status.lastUsed).toLocaleTimeString()}`
                : 'Not yet used this session';
            card.innerHTML = `
                <div class="model-fleet-header">
                    <span class="model-fleet-emoji">${emoji}</span>
                    <div class="model-warmth-badge ${status.warm ? 'warm' : 'cold'}">
                        ${status.warm ? '🔥 Warm' : '❄️ Cold'}
                    </div>
                </div>
                <div class="model-fleet-name">${model}</div>
                <div class="model-fleet-role">${role}</div>
                <div class="model-fleet-meta">
                    <span>${size}</span>
                    <span class="model-fleet-last">${lastUsedText}</span>
                </div>
            `;
            grid.appendChild(card);
        }
    }

    setInterval(() => {
        if (document.getElementById('models-view').classList.contains('active')) {
            fetchModelWarmth();
        }
    }, 15000);

    // ══════════════════════════════════════════
    // WEBSOCKET — Pipeline Logs + Status
    // ══════════════════════════════════════════
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}`;
    let ws;

    function connectWS() {
        ws = new WebSocket(wsUrl);
        const terminalOutput = document.getElementById('terminal-output');

        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);

            if (data.type === 'log') {
                // Colour-code log lines by keyword
                const div = document.createElement('div');
                const msg = data.message;
                div.textContent = `> ${msg}`;

                if (msg.includes('[Gemini Planner]')) div.classList.add('log-planner');
                else if (msg.includes('[Tool Result]')) div.classList.add('log-tool-result');
                else if (msg.includes('[Gemini Synthesiser]')) div.classList.add('log-synthesiser');
                else if (msg.includes('[Local Executor') || msg.includes('TOOL CALLED')) div.classList.add('log-executor');
                else if (msg.includes('[Model Warmth]')) div.classList.add('log-warmth');
                else if (msg.includes('ERROR') || msg.includes('failed')) div.classList.add('log-error');
                else if (msg.includes('✅') || msg.includes('Done')) div.classList.add('log-success');

                terminalOutput.appendChild(div);
                terminalOutput.scrollTop = terminalOutput.scrollHeight;
            }

            if (data.type === 'status') {
                showStatus(data.stage, data.message);
                if (data.stage === 'done' || data.stage === 'error') {
                    document.querySelectorAll('.cold-start-banner').forEach(el => el.remove());
                }
            }

            if (data.type === 'cold_start') {
                // Flash a cold-start banner in the chat too
                const banner = document.createElement('div');
                banner.className = 'message system-msg cold-start-banner';
                banner.textContent = `🧠 Loading specialist model (${data.model}) — please wait ~30s...`;
                chatHistory.appendChild(banner);
                chatHistory.scrollTop = chatHistory.scrollHeight;
            }

            if (data.type === 'speak') {
                // Autonomously triggered Voice Alert
                if (typeof playWebTTS === 'function') {
                    playWebTTS(data.text);
                }
            }

            if (data.type === 'TELEMETRY_UPDATE') {
                const tel = data.data;
                document.getElementById('telemetry-duration').textContent = `${tel.durationMs}ms`;
                document.getElementById('telemetry-model').textContent = tel.modelUsed;
                document.getElementById('telemetry-route').textContent = tel.route;
            }

            if (data.type === 'PROACTIVE_MSG') {
                appendMessage(data.data, 'jarvis', { modelChain: 'Proactive Monitor' });
                if (ttsToggle.checked) {
                    playWebTTS(data.data);
                }
            }
        };

        ws.onclose = () => setTimeout(connectWS, 5000);
    }
    connectWS();

    // Clear logs button
    document.getElementById('clear-logs-btn').addEventListener('click', () => {
        document.getElementById('terminal-output').innerHTML = '';
    });

    // ══════════════════════════════════════════
    // OPENCLAW CONTROL
    // ══════════════════════════════════════════
    document.getElementById('start-openclaw-btn').addEventListener('click', async () => {
        await fetch('/api/openclaw/start', { method: 'POST' });
    });
    document.getElementById('stop-openclaw-btn').addEventListener('click', async () => {
        await fetch('/api/openclaw/stop', { method: 'POST' });
    });

    // ══════════════════════════════════════════
    // AUTOMATION VAULT
    // ══════════════════════════════════════════
    async function fetchScripts() {
        try {
            const res = await fetch('/api/scripts');
            const data = await res.json();
            const grid = document.getElementById('vault-grid');
            grid.innerHTML = '';
            
            if (!data.scripts || data.scripts.length === 0) {
                grid.innerHTML = '<div class="model-fleet-card loading"><div>The Automation Vault is empty. Ask Jarvis to create a script!</div></div>';
                return;
            }

            data.scripts.forEach(script => {
                const card = document.createElement('div');
                card.className = 'model-fleet-card warm'; // Reusing classes for styling
                card.innerHTML = `
                    <div class="model-fleet-header">
                        <div class="model-fleet-name">${script.name}</div>
                    </div>
                    <div class="model-fleet-role" style="color: var(--text);">${script.description}</div>
                    <div class="model-fleet-meta">
                        <span>${(script.size / 1024).toFixed(1)} KB</span>
                        <span class="model-fleet-last">Ready to run</span>
                    </div>
                `;
                grid.appendChild(card);
            });
        } catch (e) {
            console.error('Failed to fetch scripts', e);
        }
    }

});
