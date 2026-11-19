# scripts/rx-agent/instalar.ps1
# =============================================================================
# CDC Manager - Raio-X: instala o lancador cdcrx:// para o utilizador atual
# -----------------------------------------------------------------------------
# SEM administrador: copia os ficheiros para %LOCALAPPDATA%\CDC-RX e regista
# o protocolo em HKCU (so este utilizador do Windows). Correr com os tres
# ficheiros na mesma pasta:
#
#   powershell -ExecutionPolicy Bypass -File .\instalar.ps1
#
# O cdc-rx.config.json vem com "simular": true (mostra o comando, nao abre
# nada). Depois de confirmar, mudar para false no ficheiro instalado.
# No PC RAIOX do Colombo, "kodakRaiz" e "E:\\BaseDadosCarestream".
#
# Desinstalar:  powershell -ExecutionPolicy Bypass -File .\instalar.ps1 -Remover
# =============================================================================
param([switch]$Remover)
$dir = Join-Path $env:LOCALAPPDATA 'CDC-RX'
$k = 'HKCU:\Software\Classes\cdcrx'
if ($Remover) {
  Remove-Item $k -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item $dir -Recurse -Force -ErrorAction SilentlyContinue
  'Lancador CDC RX removido.'
  return
}
New-Item $dir -ItemType Directory -Force | Out-Null
Copy-Item (Join-Path $PSScriptRoot 'cdc-rx-launcher.ps1') $dir -Force
# Nao substituir um config ja ajustado no posto
if (-not (Test-Path (Join-Path $dir 'cdc-rx.config.json'))) { Copy-Item (Join-Path $PSScriptRoot 'cdc-rx.config.json') $dir }
New-Item "$k\shell\open\command" -Force | Out-Null
Set-ItemProperty $k -Name '(default)' -Value 'URL:CDC Manager Raio-X'
New-ItemProperty $k -Name 'URL Protocol' -Value '' -PropertyType String -Force | Out-Null
$ps = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
Set-ItemProperty "$k\shell\open\command" -Name '(default)' -Value ('"{0}" -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "{1}" "%1"' -f $ps, (Join-Path $dir 'cdc-rx-launcher.ps1'))
"Lancador CDC RX instalado em $dir"
"Teste: Start-Process 'cdcrx://irys/?patid=P0000001&name=TESTE&surname=TESTE'"
