// 📄 scripts/odontograma/build-tooth-art.mjs
// =============================================================================
// CDC Manager — Odontograma: gerador da arte anatómica dos dentes
// -----------------------------------------------------------------------------
// Lê os SVG de scripts/odontograma/svg/ (perfil "measured" do projeto
// React Advanced Odontogram, de Zoltán Dul — licença MIT, ver
// LICENSE-react-advanced-odontogram.txt na mesma pasta) e extrai APENAS as
// camadas de que o CDC Manager precisa, como dados (paths), para
// src/components/clinico/odontograma/tooth-art.generated.ts.
//
// Cada SVG de origem tem ~130 camadas e ~100 KB; o módulo gerado fica com a
// silhueta, os brilhos, as regiões das faces, cárie, selante, endodontia,
// espigão, coroa, faceta e conector de ponte — o resto (orto, cálculo, perio,
// materiais) não é usado e não entra no bundle.
//
// Correr:  node scripts/odontograma/build-tooth-art.mjs
// Sem dependências (parser XML mínimo — os SVG são gerados por máquina).
// =============================================================================

import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, 'svg');
const OUT = join(HERE, '..', '..', 'src', 'components', 'clinico', 'odontograma', 'tooth-art.generated.ts');

// --- Parser XML mínimo -------------------------------------------------------
function parse(xml) {
  const root = { tag: '#root', attrs: {}, children: [] };
  const stack = [root];
  const re = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<(\/?)([\w:-]+)((?:\s+[\w:-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g;
  let m;
  while ((m = re.exec(xml))) {
    if (!m[2]) continue; // comentário / declaração
    const [, close, tag, rawAttrs, selfClose] = m;
    if (close) {
      stack.pop();
      continue;
    }
    const attrs = {};
    const ar = /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
    let a;
    while ((a = ar.exec(rawAttrs))) attrs[a[1]] = a[2] ?? a[3];
    const node = { tag, attrs, children: [] };
    stack[stack.length - 1].children.push(node);
    if (!selfClose) stack.push(node);
  }
  return root.children.find(c => c.tag === 'svg');
}

function findById(node, id) {
  if (node.attrs.id === id) return node;
  for (const c of node.children) {
    const hit = findById(c, id);
    if (hit) return hit;
  }
  return null;
}

// --- Estilo: resolve var(--x, fallback) e devolve as props que interessam ----
function resolveVars(value) {
  let v = value;
  for (let i = 0; i < 6 && v.includes('var('); i++) {
    v = v.replace(/var\(\s*--[\w-]+\s*,\s*((?:[^()]|\([^()]*\))+)\)/g, '$1');
  }
  return v.trim();
}
function styleOf(node) {
  const out = {};
  for (const part of (node.attrs.style ?? '').split(';')) {
    const i = part.indexOf(':');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = resolveVars(part.slice(i + 1));
  }
  return out;
}

const num = v => Number(Number(v).toFixed(2));

/** Achata um nó (path/circle/line/polyline/polygon/g) numa lista de formas. */
function shapes(node, file) {
  const out = [];
  const walk = n => {
    if (n.attrs.transform) throw new Error(`${file}: transform inesperado em ${n.attrs.id ?? n.tag}`);
    if (n.tag === 'g') {
      n.children.forEach(walk);
      return;
    }
    const st = styleOf(n);
    const s = {};
    if (n.tag === 'path') s.d = n.attrs.d;
    else if (n.tag === 'circle') s.c = [num(n.attrs.cx), num(n.attrs.cy), num(n.attrs.r)];
    else if (n.tag === 'line') s.d = `M${n.attrs.x1},${n.attrs.y1}L${n.attrs.x2},${n.attrs.y2}`;
    else if (n.tag === 'polyline') s.d = 'M' + n.attrs.points.trim().split(/\s+/).join('L');
    else if (n.tag === 'polygon') s.d = 'M' + n.attrs.points.trim().split(/\s+/).join('L') + 'Z';
    else return;
    // gradientes (url(#…)) não são transportados: o renderizador pinta por cima
    const fill = st.fill ?? '#000';
    s.f = fill.startsWith('url(') ? 'body' : fill;
    if (st.stroke && st.stroke !== 'none') {
      s.s = st.stroke;
      s.w = num(parseFloat(st['stroke-width'] ?? '1'));
    }
    if (st.opacity) s.o = num(st.opacity);
    out.push(s);
  };
  walk(node);
  return out;
}

const FACE_IDS = { V: 'buccal', L: 'lingual', M: 'mesial', D: 'distal', O: 'occlusal' };

function build(file) {
  const svg = parse(readFileSync(join(SRC, file), 'utf8'));
  const occl = file.includes('_occl');
  const a = svg.attrs;
  const get = (id, optional = false) => {
    const n = findById(svg, id);
    if (!n && !optional) throw new Error(`${file}: camada em falta: ${id}`);
    return n ? shapes(n, file) : null;
  };
  const art = {
    vb: a.viewBox.trim().split(/\s+/).map(num),
    crown: [num(a['data-crown-left']), num(a['data-crown-right'])],
    body: get('tooth-base'),
    crownShape: get('zircon-crown'),
    veneer: get('zircon-veneer'),
    connector: get('zircon-bridge-connector'),
    seal: get('fissure-sealing', true),
    face: {},
    caries: {},
  };
  for (const [key, name] of Object.entries(FACE_IDS)) {
    const f = get(`filling-composite-${name}`, true);
    if (f) art.face[key] = f;
    const c = get(`caries-${name}`, true);
    if (c) art.caries[key] = c;
  }
  if (!occl) {
    art.cejY = num(a['data-cej-y']);
    art.implant = [num(a['data-implant-left']), num(a['data-implant-right']), num(a['data-implant-platform-y'])];
    art.highlight = get('tooth-base-beauty');
    art.radix = get('tooth-radix');
    art.endo = get('endo-filling');
    art.post = get('endo-metal-pin');
  }
  return art;
}

const side = {};
const occlusal = {};
for (const file of readdirSync(SRC).filter(f => f.endsWith('.svg')).sort()) {
  const key = file.replace('.svg', '').replace('_occl', '');
  (file.includes('_occl') ? occlusal : side)[key] = build(file);
}

const header = `// 📄 src/components/clinico/odontograma/tooth-art.generated.ts
// =============================================================================
// FICHEIRO GERADO — não editar à mão.
// Gerador: node scripts/odontograma/build-tooth-art.mjs
//
// Geometria anatómica dos dentes (perfil "measured") derivada de
// React Advanced Odontogram — © 2026 Zoltán Dul, licença MIT
// https://github.com/ZoliQua/React-Advanced-Odontogram
// (texto da licença: scripts/odontograma/svg/LICENSE-react-advanced-odontogram.txt)
//
// Convenção dos templates: quadrante 1 (11–18) e quadrante 3 (31–38), sempre
// desenhados com a RAIZ PARA CIMA e a coroa para baixo; mesial à direita.
// Os quadrantes 2 e 4 obtêm-se por espelho; a arcada inferior roda 180°.
// =============================================================================

import type { SideArt, OcclusalArt } from './tooth-art.types';

`;
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(
  OUT,
  header +
    `export const SIDE_ART: Record<string, SideArt> = ${JSON.stringify(side)};\n\n` +
    `export const OCCLUSAL_ART: Record<string, OcclusalArt> = ${JSON.stringify(occlusal)};\n`,
);
console.log(`OK — ${Object.keys(side).length} vistas laterais, ${Object.keys(occlusal).length} oclusais → ${OUT}`);
