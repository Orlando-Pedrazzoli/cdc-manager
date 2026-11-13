// 📄 src/lib/org-settings.ts
// =============================================================================
// CDC Manager — Definições operacionais da organização (5.ª ronda, nov. 2026)
// -----------------------------------------------------------------------------
// Promoção do mês (09) e restrição de rede (14). Leitura com cache() por
// pedido; nunca lança — sem registo ou sem BD devolve os valores por
// omissão (sem promoção, sem restrição).
// =============================================================================

import { cache } from 'react';
import { headers } from 'next/headers';
import { dbConnect } from '@/lib/mongodb';
import Organization from '@/models/Organization';
import {
  NO_RESTRICTION,
  clientIpFromHeaders,
  isBlockedByNetwork,
  type NetworkRestriction,
} from '@/lib/network-access';

export interface OrganizationSettings {
  monthlyPromo: string | null;
  /** 7.ª ronda/A1: textos das mensagens (null = texto por omissão) */
  messageTemplates: { birthday: string | null; noShow: string | null };
  network: NetworkRestriction;
}

/** Sem cache — para o login (authorize corre fora de um render) */
export async function readOrganizationSettings(): Promise<OrganizationSettings> {
  try {
    await dbConnect();
    const org = await Organization.findOne()
      .select('monthlyPromo networkRestriction messageTemplates')
      .lean();
    return {
      monthlyPromo: org?.monthlyPromo?.trim() || null,
      messageTemplates: {
        birthday: org?.messageTemplates?.birthday?.trim() || null,
        noShow: org?.messageTemplates?.noShow?.trim() || null,
      },
      network: org?.networkRestriction
        ? {
            enabled: !!org.networkRestriction.enabled,
            allowedIps: org.networkRestriction.allowedIps ?? [],
            roles: org.networkRestriction.roles ?? [],
          }
        : NO_RESTRICTION,
    };
  } catch (err) {
    console.error('[org-settings] leitura falhou — a usar defaults:', err);
    return {
      monthlyPromo: null,
      messageTemplates: { birthday: null, noShow: null },
      network: NO_RESTRICTION,
    };
  }
}

export const getOrganizationSettings = cache(readOrganizationSettings);

/** IP público de quem faz este pedido (server components e actions) */
export async function currentClientIp(): Promise<string | null> {
  try {
    return clientIpFromHeaders(await headers());
  } catch {
    return null;
  }
}

/**
 * Este perfil, a partir deste pedido, está fora da rede permitida?
 * Chamado pelos guardas de sessão (layouts e actions).
 */
export async function isRequestOutsideClinic(
  role: string | null | undefined,
): Promise<boolean> {
  const { network } = await getOrganizationSettings();
  if (!network.enabled) return false;
  return isBlockedByNetwork(role, await currentClientIp(), network);
}
