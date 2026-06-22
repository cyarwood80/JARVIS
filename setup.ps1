# setup.ps1
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "     JARVIS AI HUB - 1-Click Setup       " -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

# 1. Node.js check
Write-Host "`n[1/5] Checking Node.js & NPM..." -ForegroundColor Yellow
if (!(Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "Node.js is not installed. Attempting to install automatically via Winget..." -ForegroundColor Cyan
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        winget install OpenJS.NodeJS -e --silent --accept-package-agreements --accept-source-agreements
        # Refresh environment variables to pick up Node
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
        
        if (!(Get-Command node -ErrorAction SilentlyContinue)) {
            Write-Host "Node.js installed but not found in PATH. Please restart your terminal and run setup.ps1 again." -ForegroundColor Red
            exit 1
        }
    } else {
        Write-Host "Winget is not available on this system. Please manually install Node.js from https://nodejs.org and try again." -ForegroundColor Red
        exit 1
    }
}
Write-Host "Node.js found." -ForegroundColor Green

Write-Host "Installing NPM dependencies for main project..."
npm install

if (Test-Path "openclaw\package.json") {
    Write-Host "Installing NPM dependencies for OpenClaw gateway..."
    Push-Location openclaw
    npm install
    Pop-Location
}

# 2. Ollama check
Write-Host "`n[2/5] Checking Ollama..." -ForegroundColor Yellow
if (!(Get-Command ollama -ErrorAction SilentlyContinue)) {
    Write-Host "Ollama is not installed. Attempting to install automatically..." -ForegroundColor Cyan
    Write-Host "Downloading Ollama setup..." -ForegroundColor DarkGray
    Invoke-WebRequest -Uri "https://ollama.com/download/OllamaSetup.exe" -OutFile "$env:TEMP\OllamaSetup.exe"
    Write-Host "Running Ollama installer..." -ForegroundColor DarkGray
    Start-Process -FilePath "$env:TEMP\OllamaSetup.exe" -ArgumentList "/S" -Wait
    
    # Refresh environment variables to pick up Ollama
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
    
    if (!(Get-Command ollama -ErrorAction SilentlyContinue)) {
        Write-Host "Ollama installed but not found in PATH. Please restart your terminal and run setup.ps1 again." -ForegroundColor Red
        exit 1
    }
}
Write-Host "Ollama found." -ForegroundColor Green

# 3. Model pulling
Write-Host "`n[3/5] Selecting Ollama Models..." -ForegroundColor Yellow
$models = @(
    "hermes3:latest",
    "qwen2.5:32b",
    "gemma4:26b",
    "llama3.1:8b",
    "llama3:8b-instruct-q8_0"
)

Write-Host "JARVIS requires several models (~50GB total). You can select which ones to download now."
foreach ($model in $models) {
    $response = Read-Host "Do you want to pull $model ? (Y/N) [Default: Y]"
    if ([string]::IsNullOrWhiteSpace($response) -or $response.ToLower().StartsWith("y")) {
        Write-Host "Pulling $model ..." -ForegroundColor Cyan
        ollama pull $model
    } else {
        Write-Host "Skipping $model." -ForegroundColor DarkGray
    }
}

# 4. Piper TTS Setup
Write-Host "`n[4/5] Setting up Piper TTS..." -ForegroundColor Yellow
if (Test-Path "download-piper.ps1") {
    Write-Host "Executing Piper download script..."
    powershell.exe -ExecutionPolicy Bypass -File "download-piper.ps1"
} else {
    Write-Host "download-piper.ps1 not found, skipping." -ForegroundColor DarkGray
}

# 5. Environment Config
Write-Host "`n[5/5] Configuring Environment Variables..." -ForegroundColor Yellow
if (!(Test-Path ".env")) {
    $apiKey = Read-Host "Please enter your Gemini API Key (leave blank to skip)"
    if (![string]::IsNullOrWhiteSpace($apiKey)) {
        Set-Content -Path ".env" -Value "GEMINI_API_KEY=$apiKey`nPORT=3000`nOLLAMA_URL=http://127.0.0.1:11434"
        Write-Host ".env file created successfully." -ForegroundColor Green
    }
} else {
    Write-Host ".env file already exists, skipping." -ForegroundColor DarkGray
}

Write-Host "`n=========================================" -ForegroundColor Cyan
Write-Host "     Setup Complete!                     " -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

$startNow = Read-Host "Do you want to start JARVIS now? (Y/N) [Default: Y]"
if ([string]::IsNullOrWhiteSpace($startNow) -or $startNow.ToLower().StartsWith("y")) {
    Write-Host "Starting JARVIS..." -ForegroundColor Green
    npm start
} else {
    Write-Host "You can start JARVIS later by running 'npm start' in this directory." -ForegroundColor Cyan
}
