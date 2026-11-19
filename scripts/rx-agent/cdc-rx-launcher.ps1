# scripts/rx-agent/cdc-rx-launcher.ps1
# =============================================================================
# CDC Manager - Raio-X: lancador do posto (protocolo cdcrx://)
# -----------------------------------------------------------------------------
# Recebe o endereco que o botao "Abrir no iRYS" / "Abrir no CS Imaging" do
# CDC Manager envia, VALIDA cada parametro e chama o programa de imagem com
# a mesma linha de comandos que o Dentoral usa (capturada a 19/11/2026):
#
#   cdcrx://irys/?patid=P0069163&name=APELIDO&surname=NOME
#     -> NNTBridge.exe /PATID P0069163 /NAME "APELIDO" /SURNAME "NOME"
#   cdcrx://kodak/?dir=J.RVG%5CJ0002369&name=NOME%20COMPLETO
#     -> TW.exe -P<kodakRaiz>\J.RVG\J0002369 -NNOME COMPLETO
#
# Seguranca: so aceita os dois destinos acima; o PATID tem de ser P + 7
# digitos; os nomes so letras, espacos, ponto, apostrofo e hifen (sem aspas);
# a pasta tem de ser <inicial>.RVG\<inicial + 7 digitos> e JA EXISTIR (este
# lancador nunca cria pastas de pacientes). Os executaveis vem do ficheiro
# cdc-rx.config.json do posto, nunca do endereco.
#
# Sem acentos de proposito (o PowerShell 5.1 le o ficheiro sem BOM como ANSI).
# =============================================================================
param([string]$Url)
Add-Type -AssemblyName System.Windows.Forms
function Aviso([string]$t) {
  $f = New-Object System.Windows.Forms.Form -Property @{ TopMost = $true }
  [void][System.Windows.Forms.MessageBox]::Show($f, $t, 'CDC Manager - Raio-X')
}
try {
  $cfg = Get-Content (Join-Path $PSScriptRoot 'cdc-rx.config.json') -Raw | ConvertFrom-Json
  if ($Url -notmatch '^cdcrx://(irys|kodak)/?\?(.+)$') { throw 'Pedido invalido.' }
  $alvo = $Matches[1].ToLower(); $qs = $Matches[2]; $q = @{}
  foreach ($par in $qs.Split('&')) { $kv = $par.Split('=', 2); if ($kv.Count -eq 2) { $q[$kv[0].ToLower()] = [Uri]::UnescapeDataString($kv[1].Replace('+', ' ')) } }
  $reNome = '^[\p{L}\p{M} .''\-]{1,60}$'
  if ($alvo -eq 'irys') {
    if ($q['patid'] -cnotmatch '^P\d{7}$') { throw 'Codigo de paciente invalido.' }
    if ($q['name'] -notmatch $reNome -or $q['surname'] -notmatch $reNome) { throw 'Nome invalido.' }
    $exe = $cfg.irysBridge
    $arg = ' /PATID {0} /NAME "{1}" /SURNAME "{2}"' -f $q['patid'], $q['name'], $q['surname']
  } else {
    if ($q['dir'] -notmatch '^([\p{L}\d(])\.RVG\\([\p{L}\d(])\d{7}$' -or $Matches[1] -ne $Matches[2]) { throw 'Pasta invalida.' }
    if ($q['name'] -notmatch $reNome) { throw 'Nome invalido.' }
    $pasta = Join-Path $cfg.kodakRaiz $q['dir']
    if (-not (Test-Path -LiteralPath $pasta)) { throw ('A pasta de imagens deste paciente nao existe: ' + $q['dir']) }
    $exe = $cfg.kodakExe
    $arg = '-P{0} -N{1}' -f $pasta, $q['name']
  }
  if (-not (Test-Path -LiteralPath $exe)) { throw ('Programa nao encontrado neste posto: ' + $exe) }
  if ($cfg.simular) { Aviso ("SIMULACAO - nada foi aberto.`n`n" + $exe + "`n" + $arg); return }
  Start-Process -FilePath $exe -ArgumentList $arg
} catch { Aviso ("Nao foi possivel abrir o programa de imagem.`n`n" + $_.Exception.Message) }
