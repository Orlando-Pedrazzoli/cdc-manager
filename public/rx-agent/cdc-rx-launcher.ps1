# CDC-RX-LAUNCHER v2
# =============================================================================
# CDC Manager - Raio-X: lancador do posto (protocolo cdcrx://)
# -----------------------------------------------------------------------------
# Recebe o endereco que os botoes "Abrir no iRYS" / "Abrir no Kodak" do CDC
# Manager enviam, VALIDA cada parametro e chama o programa de imagem com a
# mesma linha de comandos que o Dentoral usa (capturada a 19/11/2026):
#
#   cdcrx://irys/?patid=P0069163&name=APELIDO&surname=NOME
#     -> NNTBridge.exe /PATID P0069163 /NAME "APELIDO" /SURNAME "NOME"
#   cdcrx://kodak/?dir=J.RVG%5CJ0002369&name=NOME%20COMPLETO
#     -> TW.exe -P<kodakRaiz>\J.RVG\J0002369 -NNOME COMPLETO
#
# Seguranca: so aceita os dois destinos acima; o PATID tem de ser P + 7
# digitos; os nomes so letras, espacos, ponto, apostrofo e hifen (sem aspas);
# a pasta tem de ser <inicial>.RVG\<inicial + 7 digitos>. Os executaveis e a
# raiz do arquivo vem do cdc-rx.config.json do posto, nunca do endereco.
#
# Pastas novas: por omissao a pasta do paciente tem de JA EXISTIR. So com
# "kodakCriar": true no config do posto E novo=1 no endereco e que o Kodak e
# chamado para uma pasta que ainda nao existe (e o Kodak que a cria, como
# acontece com o Dentoral).
#
# Ficheiro so com ASCII, sem BOM: e servido em /rx-agent/ e descarregado
# pelo instalar.ps1.
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
    if (-not $exe) { throw 'Este posto nao tem o iRYS (MyRay) configurado.' }
    $arg = ' /PATID {0} /NAME "{1}" /SURNAME "{2}"' -f $q['patid'], $q['name'], $q['surname']
  } else {
    if ($q['dir'] -notmatch '^([\p{L}\d(])\.RVG\\([\p{L}\d(])\d{7}$' -or $Matches[1] -ne $Matches[2]) { throw 'Pasta invalida.' }
    if ($q['name'] -notmatch $reNome) { throw 'Nome invalido.' }
    $exe = $cfg.kodakExe
    if (-not $exe) { throw 'Este posto nao tem o Kodak (CS Imaging) configurado.' }
    if (-not $cfg.kodakRaiz -or -not (Test-Path -LiteralPath $cfg.kodakRaiz)) { throw ('O arquivo de imagens do Kodak nao esta acessivel neste posto: ' + $cfg.kodakRaiz) }
    $pasta = Join-Path $cfg.kodakRaiz $q['dir']
    if (-not (Test-Path -LiteralPath $pasta)) {
      if (-not ($q['novo'] -eq '1' -and $cfg.kodakCriar -eq $true)) { throw ('A pasta de imagens deste paciente nao existe: ' + $q['dir']) }
    }
    $arg = '-P{0} -N{1}' -f $pasta, $q['name']
  }
  if (-not (Test-Path -LiteralPath $exe)) { throw ('Programa nao encontrado neste posto: ' + $exe) }
  if ($cfg.simular -eq $true) { Aviso ("SIMULACAO - nada foi aberto.`n`n" + $exe + "`n" + $arg); return }
  Start-Process -FilePath $exe -ArgumentList $arg
} catch { Aviso ("Nao foi possivel abrir o programa de imagem.`n`n" + $_.Exception.Message) }
