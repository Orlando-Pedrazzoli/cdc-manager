# CDC-RX-DESINSTALAR v2
# Remove o lancador cdcrx:// do utilizador atual. Num PowerShell normal:
#   [Net.ServicePointManager]::SecurityProtocol='Tls12'; iex (New-Object Net.WebClient).DownloadString('https://www.cdcclinicas.com/rx-agent/desinstalar.ps1')
& {
  Remove-Item 'HKCU:\Software\Classes\cdcrx' -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item (Join-Path $env:LOCALAPPDATA 'CDC-RX') -Recurse -Force -ErrorAction SilentlyContinue
  "Lancador CDC RX removido de $env:COMPUTERNAME ($env:USERNAME)."
}
