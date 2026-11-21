# Lançador CDC RX (`cdcrx://`)

Faz no posto o que o Dentoral fazia: abre o paciente no software de imagem a partir da ficha.
O CDC Manager é web e não pode lançar programas; os botões da ficha chamam um endereço `cdcrx://`
e o lançador instalado no posto valida-o e corre a mesma linha de comandos do Dentoral.

| Botão | Endereço | Comando no posto |
|---|---|---|
| Abrir no iRYS | `cdcrx://irys/?patid=P0069163&name=APELIDO&surname=NOME` | `C:\NNT\NNTBridge.exe /PATID P0069163 /NAME "APELIDO" /SURNAME "NOME"` |
| Abrir no Kodak | `cdcrx://kodak/?dir=J.RVG%5CJ0002369&name=NOME%20COMPLETO` | `TW.exe -PZ:\J.RVG\J0002369 -NNOME COMPLETO` |

- Endereços: `src/lib/rx-launch.ts` (testes em `scripts/tests/rx-launch.test.ts`).
- Botões: `src/components/rx/RxLaunchButton.tsx` (ficha do paciente e painel Raio-X da consulta).
- Ficheiros do posto: `public/rx-agent/` — servidos pela própria aplicação em `https://www.cdcclinicas.com/rx-agent/`, para o posto os ir buscar sem pen nem cópias.

## Instalar ou atualizar num posto

Por utilizador do Windows, **sem administrador**. PowerShell normal (Windows + R, `powershell`, Enter) e colar uma linha:

```powershell
[Net.ServicePointManager]::SecurityProtocol='Tls12'; iex (New-Object Net.WebClient).DownloadString('https://www.cdcclinicas.com/rx-agent/instalar.ps1')
```

O instalador descarrega o lançador para `%LOCALAPPDATA%\CDC-RX`, lê `C:\DENTORAL6\DR4-RX.INI` para saber onde
estão o Kodak e o iRYS **nesse** posto, grava o `cdc-rx.config.json`, regista o protocolo em
`HKCU\Software\Classes\cdcrx` e mostra um resumo. Pode correr-se as vezes que for preciso.

Opções, definidas antes de colar a linha:

| Variável | Efeito |
|---|---|
| `$env:CDC_RX_SIMULAR = '1'` | o lançador mostra o comando em vez de abrir o programa |
| `$env:CDC_RX_CRIAR = '1'` | permite abrir o Kodak numa pasta que ainda não existe (só para o teste de paciente novo) |

Remover:

```powershell
[Net.ServicePointManager]::SecurityProtocol='Tls12'; iex (New-Object Net.WebClient).DownloadString('https://www.cdcclinicas.com/rx-agent/desinstalar.ps1')
```

## Configuração do posto (`cdc-rx.config.json`, gerada pelo instalador)

| Chave | De onde vem | Exemplos |
|---|---|---|
| `kodakExe` | `[TROPHY] Program` do `DR4-RX.INI` | `…\Carestream\CSImaging\TW.exe`; no `DESKTOP-C8O6NI6` é `…\Carestream\Dental Imaging Software\TW.exe` |
| `kodakRaiz` | `[TROPHY] Data`; se faltar, onde houver `PATIENTS.DBF` | `Z:\` nos gabinetes; `E:\BaseDadosCarestream` no PC RAIOX |
| `irysBridge` | `[MYRAY] Program` | `C:\NNT\NNTBridge.exe`; vazio onde não há iRYS |
| `simular`, `kodakCriar` | opções acima | `false` em uso normal |

## O que o lançador recusa

- Destinos que não sejam `irys` ou `kodak`.
- `patid` diferente de `P` + 7 dígitos.
- Nomes com algo além de letras, espaços, ponto, apóstrofo e hífen (nunca aspas).
- Pasta Kodak fora do formato `<inicial>.RVG\<inicial + 7 dígitos>`.
- Pasta Kodak que não exista, salvo `kodakCriar` ativo no posto **e** `novo=1` no endereço.

## De onde vem a pasta do Kodak

O CS Imaging identifica o paciente pela pasta, não pelo n.º de processo. A ligação está na tabela `rx_kodak`
do Dentoral e é migrada para `Patient.kodakFolder` por `scripts/migracao/16-rx-kodak.ts`. Sem pasta atribuída,
o botão "Abrir no Kodak" não aparece. O arquivo Kodak da Buraca é outro e ainda não está migrado.

## Estado

- 19/11/2026: lançador v1 instalado à mão nos cinco gabinetes do Colombo; iRYS a abrir pelo CDC Manager em quatro
  (no `Gabinete-2` o iRYS não arranca; usa só o Kodak).
- 21/11/2026: lançador v2 (pastas novas opcionais, mensagens por posto), instalador por uma linha e botão
  "Abrir no Kodak". **O caminho do Kodak ainda não foi testado num posto real** — previsto para 24/11/2026.
- Por decidir: como atribuir pasta a pacientes que ainda não a têm (o Dentoral cria-a ao primeiro clique).
