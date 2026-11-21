# CDC-RX-INSTALAR v2
# =============================================================================
# CDC Manager - Raio-X: instala ou atualiza o lancador cdcrx:// neste posto,
# para o utilizador do Windows que esta com sessao aberta. SEM administrador.
#
# Num PowerShell normal (Windows + R, powershell, Enter), colar UMA linha:
#
#   [Net.ServicePointManager]::SecurityProtocol='Tls12'; iex (New-Object Net.WebClient).DownloadString('https://www.cdcclinicas.com/rx-agent/instalar.ps1')
#
# O que faz:
#   1. Descarrega o lancador para %LOCALAPPDATA%\CDC-RX
#   2. Le C:\DENTORAL6\DR4-RX.INI para saber onde estao o Kodak e o iRYS
#      NESTE posto (os caminhos mudam de posto para posto) e grava o config
#   3. Regista o protocolo cdcrx em HKCU (so este utilizador)
#   4. Mostra o resumo: o que encontrou e o que falta
#
# Opcoes (definir ANTES de colar a linha):
#   $env:CDC_RX_SIMULAR = '1'   mostra o comando em vez de abrir o programa
#   $env:CDC_RX_CRIAR   = '1'   permite abrir o Kodak numa pasta que ainda
#                               nao existe (so para o teste de paciente novo)
#
# Ficheiro so com ASCII, sem BOM.
# =============================================================================
& {
  $ErrorActionPreference = 'Stop'
  try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $base = 'https://www.cdcclinicas.com/rx-agent'
    $dir = Join-Path $env:LOCALAPPDATA 'CDC-RX'
    New-Item $dir -ItemType Directory -Force | Out-Null

    # 1. Lancador
    $src = (New-Object Net.WebClient).DownloadString("$base/cdc-rx-launcher.ps1")
    if ($src -notmatch 'CDC-RX-LAUNCHER v(\d+)') { throw 'O download do lancador falhou (conteudo inesperado).' }
    $versao = $Matches[1]
    Set-Content (Join-Path $dir 'cdc-rx-launcher.ps1') $src -Encoding UTF8

    # 2. Configuracao do posto, a partir do DR4-RX.INI do Dentoral
    $ini = 'C:\DENTORAL6\DR4-RX.INI'; $sec = ''; $v = @{}
    if (Test-Path $ini) {
      foreach ($l in Get-Content $ini) {
        if ($l -match '^\s*\[(.+)\]') { $sec = $Matches[1].Trim().ToUpper() }
        elseif ($l -match '^\s*(\w+)\s*=\s*(.*)$') { $v["$sec.$($Matches[1].ToUpper())"] = $Matches[2].Trim() }
      }
    }
    $kodakExe = ''
    $candK = @($v['TROPHY.PROGRAM'],
      'C:\Program Files (x86)\Carestream\CSImaging\TW.exe',
      'C:\Program Files (x86)\Carestream\Dental Imaging Software\TW.exe',
      'C:\Program Files\Kodak\KODAK Dental Imaging Software\TW.exe')
    foreach ($c in $candK) { if ($c -and (Test-Path -LiteralPath $c)) { $kodakExe = $c; break } }
    $kodakRaiz = $v['TROPHY.DATA']
    if (-not $kodakRaiz) {
      foreach ($c in @('Z:\', 'E:\BaseDadosCarestream')) { if (Test-Path -LiteralPath (Join-Path $c 'PATIENTS.DBF')) { $kodakRaiz = $c; break } }
    }
    if (-not $kodakRaiz) { $kodakRaiz = 'Z:\' }
    $irys = ''
    foreach ($c in @($v['MYRAY.PROGRAM'], 'C:\NNT\NNTBridge.exe')) { if ($c -and (Test-Path -LiteralPath $c)) { $irys = $c; break } }

    $cfg = [ordered]@{
      simular    = ($env:CDC_RX_SIMULAR -eq '1')
      irysBridge = $irys
      kodakExe   = $kodakExe
      kodakRaiz  = $kodakRaiz
      kodakCriar = ($env:CDC_RX_CRIAR -eq '1')
    }
    $cfg | ConvertTo-Json | Set-Content (Join-Path $dir 'cdc-rx.config.json') -Encoding UTF8

    # 3. Protocolo cdcrx:// (so este utilizador)
    $k = 'HKCU:\Software\Classes\cdcrx'
    New-Item "$k\shell\open\command" -Force | Out-Null
    Set-ItemProperty $k -Name '(default)' -Value 'URL:CDC Manager Raio-X'
    New-ItemProperty $k -Name 'URL Protocol' -Value '' -PropertyType String -Force | Out-Null
    $ps = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    Set-ItemProperty "$k\shell\open\command" -Name '(default)' -Value ('"{0}" -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "{1}" "%1"' -f $ps, (Join-Path $dir 'cdc-rx-launcher.ps1'))

    # 4. Resumo
    $dbf = Test-Path -LiteralPath (Join-Path $kodakRaiz 'PATIENTS.DBF')
    "=== CDC RX v$versao | POSTO: $env:COMPUTERNAME | $env:USERDOMAIN\$env:USERNAME ==="
    "Kodak : " + $(if ($kodakExe) { $kodakExe } else { 'NAO ENCONTRADO' })
    "Raiz  : $kodakRaiz | arquivo acessivel: $dbf"
    "iRYS  : " + $(if ($irys) { $irys } else { 'nao tem' })
    "Modo  : " + $(if ($cfg.simular) { 'SIMULADO' } else { 'real' }) + $(if ($cfg.kodakCriar) { ' | pastas novas PERMITIDAS' } else { '' })
    if ($kodakExe -and $dbf) { 'INSTALADO - Kodak pronto neste posto.' }
    elseif ($irys) { 'INSTALADO - so o iRYS; o Kodak NAO esta pronto neste posto (ver linhas acima).' }
    else { 'INSTALADO, mas este posto nao tem Kodak nem iRYS acessiveis.' }
  } catch { 'ERRO: ' + $_.Exception.Message }
}
