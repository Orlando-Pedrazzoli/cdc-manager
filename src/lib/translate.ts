// 📄 src/lib/translate.ts
// =============================================================================
// CDC Manager — Tradução EN → PT-PT de conteúdo científico (Novidades)
// -----------------------------------------------------------------------------
// Sem SDK — chamadas HTTP diretas ao fornecedor que tiver chave configurada
// (Gemini free tier por defeito; ver `provider()`). Cache de 7 dias por
// conteúdo (unstable_cache, chave = hash do texto) — o mesmo artigo nunca se
// traduz duas vezes. Sem nenhuma chave, devolve null e a página mostra o
// original em inglês (nunca falha por causa disto).
// Terminologia: pede-se português europeu e termos clínicos consagrados
// (ex.: "implante", "periodontite", "ensaio clínico aleatorizado").
// =============================================================================

import { createHash } from 'node:crypto';
import { unstable_cache } from 'next/cache';

// Fornecedor escolhido pela chave presente (ordem: grátis primeiro):
//   GEMINI_API_KEY   → Google Gemini Flash (free tier: 1500 pedidos/dia, sem cartão)
//   GROQ_API_KEY     → Groq / Llama 3.3 70B (free tier, sem cartão)
//   ANTHROPIC_API_KEY→ Claude Haiku (pago, cêntimos)
const SYSTEM =
  'És um tradutor especializado em medicina dentária. Traduz do inglês para PORTUGUÊS EUROPEU (Portugal), com terminologia clínica corrente entre médicos dentistas portugueses. Mantém siglas consagradas (RCT, CAD/CAM, CBCT), nomes de materiais e valores numéricos. Não acrescentes comentários nem explicações.';

type Provider = 'gemini' | 'groq' | 'anthropic' | null;
function provider(): Provider {
  if (process.env.GEMINI_API_KEY) return 'gemini';
  if (process.env.GROQ_API_KEY) return 'groq';
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  return null;
}

async function callLLM(
  user: string,
  maxTokens: number,
): Promise<string | null> {
  const p = provider();
  try {
    if (p === 'gemini') {
      const model = process.env.TRANSLATE_MODEL ?? 'gemini-3.6-flash';
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: SYSTEM }] },
            contents: [{ role: 'user', parts: [{ text: user }] }],
            generationConfig: { maxOutputTokens: maxTokens, temperature: 0.2 },
          }),
        },
      );
      if (!res.ok) {
        console.error(
          '[translate] gemini',
          res.status,
          await res.text().catch(() => ''),
        );
        return null;
      }
      const j = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      return (
        (j.candidates?.[0]?.content?.parts ?? [])
          .map(x => x.text ?? '')
          .join('')
          .trim() || null
      );
    }
    if (p === 'groq') {
      const model = process.env.TRANSLATE_MODEL ?? 'llama-3.3-70b-versatile';
      const res = await fetch(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          },
          body: JSON.stringify({
            model,
            max_tokens: maxTokens,
            temperature: 0.2,
            messages: [
              { role: 'system', content: SYSTEM },
              { role: 'user', content: user },
            ],
          }),
        },
      );
      if (!res.ok) {
        console.error(
          '[translate] groq',
          res.status,
          await res.text().catch(() => ''),
        );
        return null;
      }
      const j = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      return j.choices?.[0]?.message?.content?.trim() || null;
    }
    if (p === 'anthropic') {
      const model = process.env.TRANSLATE_MODEL ?? 'claude-haiku-4-5-20251001';
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY as string,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          system: SYSTEM,
          messages: [{ role: 'user', content: user }],
        }),
      });
      if (!res.ok) {
        console.error(
          '[translate] anthropic',
          res.status,
          await res.text().catch(() => ''),
        );
        return null;
      }
      const j = (await res.json()) as {
        content?: { type: string; text?: string }[];
      };
      return (
        (j.content ?? [])
          .map(c => (c.type === 'text' ? (c.text ?? '') : ''))
          .join('')
          .trim() || null
      );
    }
  } catch (e) {
    console.error('[translate]', e);
  }
  return null;
}

const hash = (s: string) =>
  createHash('sha1').update(s).digest('hex').slice(0, 16);

/** Traduz N títulos numa só chamada; devolve na mesma ordem (ou null) */
export async function translateTitles(
  titles: string[],
): Promise<string[] | null> {
  if (titles.length === 0) return [];
  const key = hash(titles.join('\n'));
  const run = unstable_cache(
    async () => {
      const numbered = titles.map((t, i) => `${i + 1}. ${t}`).join('\n');
      const out = await callLLM(
        `Traduz cada título abaixo. Responde APENAS com um array JSON de strings, na mesma ordem, sem numeração:\n\n${numbered}`,
        2500,
      );
      if (!out) return null;
      try {
        const arr = JSON.parse(
          out.replace(/^```json\s*|```$/g, '').trim(),
        ) as unknown;
        if (
          Array.isArray(arr) &&
          arr.length === titles.length &&
          arr.every(x => typeof x === 'string')
        ) {
          return arr as string[];
        }
      } catch {
        /* cai para null */
      }
      return null;
    },
    ['pubmed-titles', key],
    { revalidate: 7 * 24 * 3600 },
  );
  return run();
}

/** Traduz um abstract (texto corrido) — cache por pmid */
export async function translateAbstract(
  pmid: string,
  text: string,
): Promise<string | null> {
  const run = unstable_cache(
    async () =>
      callLLM(
        `Traduz o resumo científico abaixo, mantendo a estrutura (parágrafos / secções como Objetivo, Métodos, Resultados, Conclusões quando existirem). Responde só com a tradução.\n\n${text}`,
        2000,
      ),
    ['pubmed-abstract-pt', pmid, hash(text)],
    { revalidate: 7 * 24 * 3600 },
  );
  return run();
}

export const translationEnabled = () => provider() !== null;
