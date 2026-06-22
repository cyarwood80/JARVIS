$ErrorActionPreference = "Stop"
$piperDir = Join-Path $PSScriptRoot "piper"
$voiceDir = Join-Path $piperDir "voice"

if (!(Test-Path $piperDir)) {
    New-Item -ItemType Directory -Path $piperDir | Out-Null
}
if (!(Test-Path $voiceDir)) {
    New-Item -ItemType Directory -Path $voiceDir | Out-Null
}

$piperExePath = Join-Path $piperDir "piper\piper.exe"
if (!(Test-Path $piperExePath)) {
    Write-Host "Downloading Piper TTS..."
    $piperZip = Join-Path $piperDir "piper.zip"
    Invoke-WebRequest -Uri "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_windows_amd64.zip" -OutFile $piperZip
    Write-Host "Extracting Piper TTS..."
    Expand-Archive -Path $piperZip -DestinationPath $piperDir -Force
    Remove-Item $piperZip
} else {
    Write-Host "Piper TTS executable already exists, skipping download." -ForegroundColor DarkGray
}

$voiceModelPath = Join-Path $voiceDir "en_US-lessac-high.onnx"
if (!(Test-Path $voiceModelPath)) {
    Write-Host "Downloading realistic voice model (en_US-lessac-high)..."
    Invoke-WebRequest -Uri "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/lessac/high/en_US-lessac-high.onnx" -OutFile $voiceModelPath
    Invoke-WebRequest -Uri "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/lessac/high/en_US-lessac-high.onnx.json" -OutFile "$voiceDir\en_US-lessac-high.onnx.json"
} else {
    Write-Host "Voice model already exists, skipping download." -ForegroundColor DarkGray
}

Write-Host "Piper TTS setup complete!"
