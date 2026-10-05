// Hello World

/**
 * Mapa de domínios da PRX: uma fonte só para o proxy, os links entre painéis, a
 * Resenha e a biometria.
 *
 *   prx.app.br          → teaser "em breve" (e /termos, /privacidade, /resenha/...)
 *   teste.prx.app.br    → o aplicativo (cadastro, login, tudo)
 *   admin.prx.app.br    → painel administrativo
 *   partner.prx.app.br  → portal do parceiro
 *   staff.prx.app.br    → Equipe PRX (portaria dos eventos e balcão)
 *   insider.prx.app.br  → portal dos Insiders da Resenha
 *   show.prx.app.br     → apresentação do ecossistema
 *
 * Localmente os mesmos rótulos valem sobre localhost (admin.localhost:3100) e o app
 * é o próprio localhost:3100. Os rótulos antigos (adminprx., staffprx., ...) seguem
 * roteados pelo proxy enquanto o DNS é migrado, mas os links gerados a partir deles
 * já apontam para o domínio novo.
 */

export const PRX_ZONE = "prx.app.br";
export const APP_LABEL = "teste";

/** Endereços públicos em produção. */
export const APP_HOST = `${APP_LABEL}.${PRX_ZONE}`;
export const APP_URL = `https://${APP_HOST}`;
export const SHOW_URL = `https://show.${PRX_ZONE}`;
export const TEASER_URL = `https://${PRX_ZONE}`;

export type Portal = "admin" | "partner" | "staff" | "insider" | "show";

/** Primeiro rótulo do host de cada portal; o primeiro de cada lista é o oficial. */
export const PORTAL_LABELS: Readonly<Record<Portal, readonly string[]>> = {
  admin: ["admin", "adminprx", "adminng"],
  partner: ["partner", "partnerprx", "partnerng"],
  staff: ["staff", "staffprx"],
  insider: ["insider"],
  show: ["show"],
};

/** Rota interna que cada portal serve na raiz do seu host. */
export const PORTAL_ROUTES: Readonly<Record<Portal, string>> = {
  admin: "/admin",
  partner: "/partner",
  staff: "/staff",
  insider: "/insider",
  show: "/apresentacao",
};

const PORTALS = Object.keys(PORTAL_LABELS) as Portal[];
const PORTAL_BY_LABEL = new Map<string, Portal>(PORTALS.flatMap((portal) => PORTAL_LABELS[portal].map((label) => [label, portal] as const)));
const FRONT_LABELS = new Set<string>([...PORTAL_BY_LABEL.keys(), APP_LABEL, "www"]);

/** Portal servido pelo host (admin.prx.app.br, adminprx.localhost:3100...), ou null. */
export function portalOfHost(host: string): Portal | null {
  return PORTAL_BY_LABEL.get(host.trim().toLowerCase().split(".")[0]) ?? null;
}

/** localhost (e *.localhost) ou IP: onde não existem subdomínios de verdade. */
export function isLocalHost(host: string): boolean {
  return /^(?:[a-z0-9-]+\.)*localhost(?::\d+)?$/i.test(host) || /^\d+\.\d+\.\d+\.\d+/.test(host);
}

/** O host sem o rótulo de portal, do app ou "www": admin.localhost:3100 → localhost:3100. */
function withoutFrontLabel(host: string): string {
  const clean = host.trim().toLowerCase();
  const match = clean.match(/^([a-z0-9-]+)\.(.+)$/);
  return match && FRONT_LABELS.has(match[1]) ? match[2] : clean;
}

/** Host do app para quem está em `host`: teste.prx.app.br em produção, o próprio localhost em desenvolvimento. */
export function appHostOf(host: string): string {
  return isLocalHost(host) ? withoutFrontLabel(host) : APP_HOST;
}

/** Host de um portal para quem está em `host`: staff.prx.app.br em produção, staff.localhost:3100 em desenvolvimento. */
export function portalHostOf(host: string, portal: Portal): string {
  return `${PORTAL_LABELS[portal][0]}.${isLocalHost(host) ? withoutFrontLabel(host) : PRX_ZONE}`;
}

/** O apex prx.app.br e todos os seus subdomínios. */
export function isPrxZoneHost(host: string): boolean {
  const name = host.trim().toLowerCase().split(":")[0];
  return name === PRX_ZONE || name.endsWith(`.${PRX_ZONE}`);
}
