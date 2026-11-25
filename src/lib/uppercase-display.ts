// 📄 src/lib/uppercase-display.ts
// =============================================================================
// CDC Manager — Ecrãs em maiúsculas (só apresentação)
// -----------------------------------------------------------------------------
// Victor, 25/11/2026 (resposta F3): "Uma dúvida: é possível ter o sistema todo
// em maiúsculas sem precisar de Caps Lock? Se der, é preferível."
//
// Opção da gestão (Configurações → Operação), desligada por omissão. Quando
// está ligada, os layouts da gestão/receção e dos médicos juntam esta folha
// de estilos à página. É só CSS: o que se escreve e o que está gravado não
// mudam, por isso desligar repõe tudo como estava.
//
// Ficam de fora, de propósito:
//   · utilizador, senha, e-mail, endereços e ficheiros — escrever "ANA.BORGES"
//     no ecrã e gravar "ana.borges" enganava quem lê a credencial;
//   · textos longos (textarea): notas clínicas, modelos e o texto dos
//     documentos, que saem em PDF tal como foram escritos;
//   · tudo o que estiver marcado com data-keep-case (Configurações, modelos,
//     credenciais mostradas na ficha do médico).
// =============================================================================

export const UPPERCASE_DISPLAY_CSS = `
body { text-transform: uppercase; }
input, select, option, button { text-transform: uppercase; }
textarea, pre, code, kbd,
input[type='email'], input[type='password'], input[type='url'], input[type='file'],
input[name*='user' i], input[name*='pass' i], input[name*='senha' i],
input[name*='email' i], input[name*='url' i], input[name='website'],
input[autocomplete='username'], input[autocomplete*='password'],
a[href^='mailto:'],
[data-keep-case], [data-keep-case] * { text-transform: none; }
::placeholder { text-transform: none; }
`;
