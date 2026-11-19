# Lançador CDC RX (`cdcrx://`)

Faz no posto o que o Dentoral fazia: abre o paciente no software de imagem a partir da ficha.
O CDC Manager é web e não pode lançar programas; o botão da ficha chama um endereço `cdcrx://`
e este lançador, instalado no posto, valida-o e corre a mesma linha de comandos do Dentoral.

| Botão | Endereço | Comando no posto |
|---|---|---|
| Abrir no iRYS | `cdcrx://irys/?patid=P0069163&name=APELIDO&surname=NOME` | `C:\NNT\NNTBridge.exe /PATID P0069163 /NAME "APELIDO" /SURNAME "NOME"` |
| Abrir no CS Imaging | `cdcrx://kodak/?dir=J.RVG%5CJ0002369&name=NOME%20COMPLETO` | `TW.exe -PZ:\J.RVG\J0002369 -NNOME COMPLETO` |

Os endereços são construídos em `src/lib/rx-launch.ts` (testes em `scripts/tests/rx-launch.test.ts`).

## Instalar (por utilizador do Windows, sem administrador)

Com os três ficheiros desta pasta no posto:

```powershell
powershell -ExecutionPolicy Bypass -File .\instalar.ps1
```

Fica em `%LOCALAPPDATA%\CDC-RX` e regista o protocolo em `HKCU\Software\Classes\cdcrx`.
Remover: `powershell -ExecutionPolicy Bypass -File .\instalar.ps1 -Remover`.

## Configuração do posto (`cdc-rx.config.json`)

| Chave | Gabinetes do Colombo | PC RAIOX do Colombo |
|---|---|---|
| `irysBridge` | `C:\NNT\NNTBridge.exe` | não tem iRYS |
| `kodakExe` | `C:\Program Files (x86)\Carestream\CSImaging\TW.exe` | igual |
| `kodakRaiz` | `Z:\` | `E:\BaseDadosCarestream` |
| `simular` | `true` mostra o comando sem abrir nada; `false` em uso real | |

## O que o lançador recusa

- Destinos que não sejam `irys` ou `kodak`.
- `patid` diferente de `P` + 7 dígitos.
- Nomes com algo além de letras, espaços, ponto, apóstrofo e hífen (nunca aspas).
- Pasta Kodak fora do formato `<inicial>.RVG\<inicial + 7 dígitos>` ou que não exista. O lançador nunca cria pastas de pacientes.

## Estado

- 19/11/2026: piloto no posto `GABINETE4` (utilizador `gabinete3`), iRYS 13.1.0 — abre o paciente pelo PowerShell e pelo browser.
- Por confirmar: regra com que o Dentoral parte o nome completo em apelido/nome próprio (usa-se primeira e última palavra).
- Por fazer: botão "Abrir no CS Imaging" (precisa do código da pasta, tabela `rx_kodak` do Dentoral, ainda não migrada).
