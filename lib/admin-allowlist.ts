// Hello World

/**
 * E-mails que sempre recebem o papel de administrador.
 *
 * A lista vem só da variável PRX_ADMIN_EMAILS (e-mails separados por vírgula),
 * definida no painel da Vercel. Sem e-mails pessoais no código-fonte (pentest M4);
 * sem a variável, ninguém ganha papel de admin pelo e-mail e o papel vem só do perfil.
 *
 * Como a lista concede privilégio pelo e-mail, esses endereços nunca podem ser
 * registrados pelo cadastro público — ver isReservedAdminEmail.
 */
const DEFAULT_ADMIN_EMAILS: string[] = [];

function normalize(email: string | null | undefined): string {
  return (email || "").toLowerCase().trim();
}

export function getAdminAllowlist(): string[] {
  const fromEnv = process.env.PRX_ADMIN_EMAILS;
  const list = fromEnv ? fromEnv.split(",") : DEFAULT_ADMIN_EMAILS;
  return list.map(normalize).filter(Boolean);
}

export function isAllowlistedAdmin(email: string | null | undefined): boolean {
  const normalized = normalize(email);
  return normalized.length > 0 && getAdminAllowlist().includes(normalized);
}

/** Usado pelo cadastro público para impedir que alguém registre um e-mail de admin. */
export const isReservedAdminEmail = isAllowlistedAdmin;
