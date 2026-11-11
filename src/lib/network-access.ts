// 📄 src/lib/network-access.ts
// =============================================================================
// CDC Manager — Acesso só dentro da clínica (5.ª ronda/14, Victor, nov. 2026)
// -----------------------------------------------------------------------------
// "O acesso dos colaboradores deve ficar limitado à rede da clínica. De casa,
// no telemóvel ou num portátil fora da clínica, não devem conseguir ver a
// agenda nem dados sensíveis como a faturação."
//
// Funções PURAS (sem BD, sem next/headers) — testáveis com tsx:
//   · clientIpFromHeaders: IP público de quem faz o pedido. Na Vercel o
//     cabeçalho de confiança é x-vercel-forwarded-for / x-real-ip (postos
//     pela plataforma); x-forwarded-for só serve em desenvolvimento.
//   · ipAllowed: o IP está na lista? Aceita IP exato (IPv4/IPv6) e prefixos
//     CIDR IPv4 ("203.0.113.0/29") para clínicas com um bloco de IP.
//   · isRoleRestricted: o perfil está sujeito à restrição?
//
// A administração NUNCA é restringida: tem de conseguir entrar de fora para
// corrigir a lista quando o IP da clínica muda.
// =============================================================================

export interface NetworkRestriction {
  enabled: boolean;
  allowedIps: string[];
  roles: string[];
}

export const RESTRICTABLE_ROLES = ['receptionist', 'doctor'] as const;
export type RestrictableRole = (typeof RESTRICTABLE_ROLES)[number];

export const NO_RESTRICTION: NetworkRestriction = {
  enabled: false,
  allowedIps: [],
  roles: [],
};

type HeaderBag = { get(name: string): string | null };

function cleanIp(raw: string): string {
  let ip = raw.trim();
  // "[::1]:3000" / "1.2.3.4:5678"
  if (ip.startsWith('[')) ip = ip.slice(1, ip.indexOf(']'));
  else if (/^\d+\.\d+\.\d+\.\d+:\d+$/.test(ip)) ip = ip.split(':')[0];
  // IPv4 mapeado em IPv6
  if (ip.toLowerCase().startsWith('::ffff:')) ip = ip.slice(7);
  return ip.toLowerCase();
}

export function clientIpFromHeaders(h: HeaderBag): string | null {
  const candidates = [
    h.get('x-vercel-forwarded-for'),
    h.get('x-real-ip'),
    h.get('x-forwarded-for'),
  ];
  for (const c of candidates) {
    const first = c?.split(',')[0];
    if (first && first.trim()) return cleanIp(first);
  }
  return null;
}

function ipv4ToInt(ip: string): number | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  if (parts.some(p => p > 255)) return null;
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

/** Entrada válida para a lista? IP exato ou CIDR IPv4 (/8 a /32). */
export function isValidAllowEntry(entry: string): boolean {
  const e = entry.trim();
  if (e.includes('/')) {
    const [base, bits] = e.split('/');
    const n = Number(bits);
    return ipv4ToInt(base) !== null && Number.isInteger(n) && n >= 8 && n <= 32;
  }
  if (ipv4ToInt(e) !== null) return true;
  // IPv6: hexadecimais e ':' com pelo menos dois ':'
  return /^[0-9a-fA-F:]+$/.test(e) && (e.match(/:/g)?.length ?? 0) >= 2;
}

export function ipAllowed(ip: string | null, allowed: string[]): boolean {
  if (!ip) return false;
  const target = cleanIp(ip);
  const targetInt = ipv4ToInt(target);
  for (const raw of allowed) {
    const entry = raw.trim().toLowerCase();
    if (!entry) continue;
    if (entry.includes('/')) {
      const [base, bits] = entry.split('/');
      const baseInt = ipv4ToInt(base);
      const n = Number(bits);
      if (baseInt === null || targetInt === null || !(n >= 0 && n <= 32)) continue;
      const mask = n === 0 ? 0 : (0xffffffff << (32 - n)) >>> 0;
      if ((baseInt & mask) >>> 0 === (targetInt & mask) >>> 0) return true;
    } else if (cleanIp(entry) === target) {
      return true;
    }
  }
  return false;
}

export function isRoleRestricted(
  role: string | null | undefined,
  cfg: NetworkRestriction,
): boolean {
  if (!cfg.enabled || !role) return false;
  if (role === 'admin' || role === 'patient') return false; // nunca
  return cfg.roles.includes(role);
}

/** true = este pedido tem de ser recusado */
export function isBlockedByNetwork(
  role: string | null | undefined,
  ip: string | null,
  cfg: NetworkRestriction,
): boolean {
  return isRoleRestricted(role, cfg) && !ipAllowed(ip, cfg.allowedIps);
}
