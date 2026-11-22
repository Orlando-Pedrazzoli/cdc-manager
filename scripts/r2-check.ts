// 📄 scripts/r2-check.ts
// =============================================================================
// Verificação da ligação ao Cloudflare R2 (passo 3 da migração)
// -----------------------------------------------------------------------------
// Exercita src/lib/storage.ts de ponta a ponta contra o bucket real, numa
// pasta de teste que é apagada no fim:
//   1. upload server-side (data URL, como as assinaturas) + HEAD + miniaturas
//   2. upload pelo "browser": URL PUT pré-assinada + fetch, como a app fará
//   3. leitura: miniatura, original (inline) e download (attachment)
//   4. PDF server-side
//   5. remoção e confirmação de que já não existe
// Não toca em nenhum ficheiro de pacientes.
//
// Correr na raiz do repo (PowerShell):
//   npx tsx --env-file=.env.local scripts/r2-check.ts
// =============================================================================

import sharp from 'sharp';
import {
  createUploadTicket,
  deleteObjectAndDerivatives,
  derivativeKey,
  downloadUrl,
  fetchObjectInfo,
  generateDerivatives,
  getObjectBuffer,
  previewUrl,
  uploadDataUrl,
  uploadPdf,
  viewUrl,
} from '@/lib/storage';

let failures = 0;
function check(label: string, ok: boolean, detail = ''): void {
  if (!ok) failures++;
  console.log(`  ${ok ? '✔' : '✖'} ${label}${detail ? ` — ${detail}` : ''}`);
}

async function main(): Promise<void> {
  const bucket = process.env.R2_BUCKET;
  const endpoint = process.env.R2_ENDPOINT ?? '';
  console.log(`R2: bucket "${bucket}" em ${endpoint.replace(/^https?:\/\//, '')}`);
  check('endpoint da jurisdição UE (.eu.)', endpoint.includes('.eu.') || process.env.R2_FORCE_PATH_STYLE === '1', endpoint);

  const base = `_teste-ligacao/${Date.now()}`;
  const keys: string[] = [];

  // Imagem de teste 2000×1200 (maior que o preview, para testar a redução)
  const jpeg = await sharp({
    create: { width: 2000, height: 1200, channels: 3, background: { r: 30, g: 120, b: 200 } },
  }).jpeg().toBuffer();
  const png = await sharp({
    create: { width: 300, height: 120, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
  }).png().toBuffer();

  // 1. Server-side
  console.log('\n1. Upload server-side (data URL)');
  const k1 = `${base}/assinatura`;
  keys.push(k1);
  const up1 = await uploadDataUrl(k1, `data:image/png;base64,${png.toString('base64')}`);
  check('upload', up1.bytes === png.length, `${up1.bytes} bytes, formato ${up1.format}`);
  const info1 = await fetchObjectInfo(k1);
  check('HEAD devolve tipo e tamanho reais', info1?.contentType === 'image/png' && info1.bytes === png.length);
  check('miniaturas criadas', (await getObjectBuffer(derivativeKey(k1, 'thumb')))?.contentType === 'image/webp');

  // 2. Browser → PUT pré-assinado
  console.log('\n2. Upload direto (URL PUT pré-assinada, como o browser)');
  const k2 = `${base}/rx`;
  keys.push(k2);
  const ticket = await createUploadTicket(k2, { contentType: 'image/jpeg', filename: 'RX panorâmica.jpg' });
  const put = await fetch(ticket.uploadUrl, { method: 'PUT', headers: ticket.headers, body: new Uint8Array(jpeg) });
  check('PUT aceite', put.ok, `HTTP ${put.status}${put.ok ? '' : ` ${(await put.text()).slice(0, 200)}`}`);
  const info2 = await fetchObjectInfo(k2);
  check('HEAD confirma o upload', info2?.bytes === jpeg.length && info2.resourceType === 'image', `${info2?.bytes} bytes, ${info2?.contentType}`);
  check('miniaturas geradas no registo', await generateDerivatives(k2));
  // Adulteração numa chave à parte (se fosse aceite, não estraga o resto do teste)
  const kBad = `${base}/adulterado`;
  keys.push(kBad);
  const badTicket = await createUploadTicket(kBad, { contentType: 'image/jpeg' });
  const tampered = await fetch(badTicket.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'text/html' }, body: 'x' });
  check('PUT com outro Content-Type é recusado', !tampered.ok, `HTTP ${tampered.status}`);

  // 3. Leitura
  console.log('\n3. Leitura por URL pré-assinada');
  const thumbUrl = await previewUrl(k2, { width: 96 });
  const thumbUrlAgain = await previewUrl(k2, { width: 96 });
  check('URL estável dentro da janela (cache do browser)', thumbUrl === thumbUrlAgain);
  const thumbRes = await fetch(thumbUrl!);
  const thumbMeta = thumbRes.ok ? await sharp(Buffer.from(await thumbRes.arrayBuffer())).metadata() : null;
  check('miniatura ≤ 480 px em webp', thumbMeta?.format === 'webp' && (thumbMeta.width ?? 9999) <= 480, `${thumbMeta?.width}×${thumbMeta?.height}`);
  const prevRes = await fetch((await previewUrl(k2, { width: 1600 }))!);
  const prevMeta = prevRes.ok ? await sharp(Buffer.from(await prevRes.arrayBuffer())).metadata() : null;
  check('preview ≤ 1600 px', (prevMeta?.width ?? 9999) <= 1600, `${prevMeta?.width}×${prevMeta?.height}`);
  const orig = await fetch(await viewUrl(k2));
  const origBytes = orig.ok ? (await orig.arrayBuffer()).byteLength : 0;
  check('original intacto', origBytes === jpeg.length, `${origBytes} bytes`);
  const dl = await fetch(await downloadUrl({ key: k2, filename: 'RX panorâmica', format: 'jpg' }));
  check('download com nome e attachment', dl.ok && (dl.headers.get('content-disposition') ?? '').includes('attachment'), dl.headers.get('content-disposition') ?? `HTTP ${dl.status}`);
  check('PDF não tem miniatura (null)', (await previewUrl(k2, { isPdf: true })) === null);

  // 4. PDF
  console.log('\n4. PDF gerado no servidor');
  const k3 = `${base}/consentimento`;
  keys.push(k3);
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
  await uploadPdf(k3, pdf, 'Consentimento.pdf');
  const info3 = await fetchObjectInfo(k3);
  check('PDF guardado', info3?.format === 'pdf' && info3.resourceType === 'image');
  check('PDF não gera miniatura', !(await generateDerivatives(k3)));

  // 5. Limpeza
  console.log('\n5. Remoção');
  for (const k of keys) await deleteObjectAndDerivatives(k);
  const gone = await Promise.all(keys.map(k => fetchObjectInfo(k)));
  check('objetos de teste apagados', gone.every(g => g === null));
  const expired = await fetch(await viewUrl(k2));
  check('URL de objeto apagado já não serve', !expired.ok, `HTTP ${expired.status}`);

  console.log(failures ? `\n✖ ${failures} verificação(ões) falharam` : '\n✔ R2 pronto: ligação, upload, leitura, miniaturas e remoção OK');
  process.exitCode = failures ? 1 : 0;
}

main().catch(e => {
  console.error('\n✖ erro:', e);
  process.exitCode = 1;
});
