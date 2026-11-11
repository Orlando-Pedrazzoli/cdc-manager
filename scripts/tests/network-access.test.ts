// 📄 scripts/tests/network-access.test.ts
// Correr: npx tsx scripts/tests/network-access.test.ts
// 5.ª ronda/14: acesso só dentro da clínica — funções puras.
import assert from 'node:assert/strict';
import {
  clientIpFromHeaders,
  ipAllowed,
  isBlockedByNetwork,
  isValidAllowEntry,
} from '../../src/lib/network-access';

let n = 0;
const test = (name: string, fn: () => void) => {
  fn();
  n++;
  console.log(`  ✓ ${name}`);
};
const headers = (h: Record<string, string>) => ({
  get: (k: string) => h[k.toLowerCase()] ?? null,
});

test('IP do pedido: prefere o cabeçalho da Vercel e o primeiro da lista', () => {
  assert.equal(
    clientIpFromHeaders(headers({ 'x-vercel-forwarded-for': '203.0.113.25', 'x-forwarded-for': '10.0.0.1' })),
    '203.0.113.25',
  );
  assert.equal(clientIpFromHeaders(headers({ 'x-forwarded-for': '198.51.100.7, 10.0.0.1' })), '198.51.100.7');
  assert.equal(clientIpFromHeaders(headers({ 'x-real-ip': '::ffff:203.0.113.25' })), '203.0.113.25');
  assert.equal(clientIpFromHeaders(headers({})), null);
});

test('lista: IP exato, bloco CIDR e IPv6', () => {
  const lista = ['203.0.113.25', '198.51.100.0/29', '2001:db8::1'];
  assert.equal(ipAllowed('203.0.113.25', lista), true);
  assert.equal(ipAllowed('203.0.113.26', lista), false);
  assert.equal(ipAllowed('198.51.100.6', lista), true);
  assert.equal(ipAllowed('198.51.100.8', lista), false);
  assert.equal(ipAllowed('2001:DB8::1', lista), true);
  assert.equal(ipAllowed(null, lista), false);
  assert.equal(ipAllowed('203.0.113.25', []), false);
});

test('validação das entradas da lista', () => {
  for (const ok of ['203.0.113.25', '198.51.100.0/29', '2001:db8::1']) assert.equal(isValidAllowEntry(ok), true, ok);
  for (const bad of ['clinica', '300.1.1.1', '10.0.0.0/4', '1.2.3', '']) assert.equal(isValidAllowEntry(bad), false, bad);
});

test('quem é bloqueado: só os perfis escolhidos, nunca a administração', () => {
  const cfg = { enabled: true, allowedIps: ['203.0.113.25'], roles: ['receptionist'] };
  assert.equal(isBlockedByNetwork('receptionist', '8.8.8.8', cfg), true);
  assert.equal(isBlockedByNetwork('receptionist', '203.0.113.25', cfg), false);
  assert.equal(isBlockedByNetwork('receptionist', null, cfg), true); // IP desconhecido não entra
  assert.equal(isBlockedByNetwork('doctor', '8.8.8.8', cfg), false); // não está na lista de perfis
  assert.equal(isBlockedByNetwork('admin', '8.8.8.8', { ...cfg, roles: ['admin', 'receptionist'] }), false);
  assert.equal(isBlockedByNetwork('patient', '8.8.8.8', { ...cfg, roles: ['patient'] }), false);
  assert.equal(isBlockedByNetwork('receptionist', '8.8.8.8', { ...cfg, enabled: false }), false);
});

console.log(`\n${n} testes OK`);
