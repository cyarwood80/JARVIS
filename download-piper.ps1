$ErrorActionPreference = "Stop"
$piperDir = "C:\Users\chris\.gemini\antigravity-ide\scratch\jarvis-ai\piper"
$voiceDir = "$piperDir\voice"

if (!(Test-Path $piperDir)) {
    New-Item -ItemType Directory -Path $piperDir | Out-Null
}
if (!(Test-Path $voiceDir)) {
    New-Item -ItemType Directory -Path $voiceDir | Out-Null
}

Write-Host "Downloading Piper TTS..."
$piperZip = "$piperDir\piper.zip"
Invoke-WebRequest -Uri "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_windows_amd64.zip" -OutFile $piperZip
Write-Host "Extracting Piper TTS..."
Expand-Archive -Path $piperZip -DestinationPath $piperDir -Force
Remove-Item $piperZip

Write-Host "Downloading realistic voice model (en_US-lessac-high)..."
Invoke-WebRequest -Uri "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/lessac/high/en_US-lessac-high.onnx" -OutFile "$voiceDir\en_US-lessac-high.onnx"
Invoke-WebRequest -Uri "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/lessac/high/en_US-lessac-high.onnx.json" -OutFile "$voiceDir\en_US-lessac-high.onnx.json"

Write-Host "Piper TTS setup complete!"
