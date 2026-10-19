// Hello World

/**
 * Formato das linhas lidas do Supabase (schema public). O client não é gerado
 * com tipos, então estas interfaces documentam as colunas usadas pelas rotas.
 * As colunas nxt_* mantêm o nome original do banco (anterior ao rebrand PRX).
 */
export interface BenefitRow {
  id: string;
  partner_id?: string | null;
  partner_name: string;
  partner_logo?: string | null;
  partner_banner?: string | null;
  partner_location?: string | null;
  category_id: string;
  title: string;
  description?: string | null;
  discount_label: string;
  min_nxt_level?: number | null;
  terms?: string[] | string | null;
  is_active?: boolean | null;
  created_at?: string | null;
  /** Colunas do programa de parceiros (migração 20260925). */
  campaign_id?: string | null;
  visibility_plan?: string | null;
  campaign_starts_at?: string | null;
  campaign_ends_at?: string | null;
  campaign_quantity?: number | null;
  campaign_per_user_limit?: number | null;
  campaign_usage_days?: number | null;
  /** Economia PRX (migração 20260927). */
  points_cost?: number | null;
  cost_price?: number | string | null;
  prx_revenue_per_redemption?: number | string | null;
  partner_fee_pct?: number | string | null;
  /** Selos (migração 20261018_prx_badges). */
  badges?: string[] | null;
}

export interface PartnerRow {
  id: string;
  name: string;
  company_name?: string | null;
  document?: string | null;
  document_type?: string | null;
  category_id?: string | null;
  description?: string | null;
  logo_url?: string | null;
  banner_url?: string | null;
  location?: string | null;
  status?: string | null;
  owner_id?: string | null;
  owner_email?: string | null;
  representative?: unknown;
  contact?: unknown;
  /** Selos (migração 20261018_prx_badges). */
  badges?: string[] | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface CampaignRow {
  id: string;
  partner_id: string;
  status: string;
  version: number;
  summary: unknown;
  benefit_id?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at?: string | null;
  sent_at?: string | null;
  accepted_at?: string | null;
  cancelled_at?: string | null;
  cancel_reason?: string | null;
}

export interface CampaignRevisionRow {
  campaign_id: string;
  version: number;
  summary: unknown;
  changed_by: string;
  changed_at: string;
}

export interface AcceptanceRow {
  id: string;
  campaign_id: string;
  partner_id: string;
  certificate_id: string;
  terms_version: string;
  campaign_version: number;
  content_hash: string;
  partner_snapshot: unknown;
  summary_snapshot: unknown;
  declaration: string;
  accepted_at: string;
  user_id: string;
  user_email: string;
  auth_method: string;
  ip_address?: string | null;
  user_agent?: string | null;
}

export interface BenefitEventRow {
  benefit_id: string;
  kind: string;
  age_band: string;
  created_at: string;
}

export interface MissionRow {
  id: string;
  title: string;
  description?: string | null;
  xp_reward: number;
  total: number;
  progress?: number | null;
  is_completed?: boolean | null;
  verification_type?: string | null;
  category?: string | null;
  created_at?: string | null;
}

export interface VoucherRow {
  id: string;
  code: string;
  user_id?: string | null;
  user_name?: string | null;
  user_email?: string | null;
  benefit_id?: string | null;
  benefit_title?: string | null;
  partner_id?: string | null;
  partner_name?: string | null;
  discount_label?: string | null;
  status: "valid" | "used";
  qr_payload?: string | null;
  terms?: string | null;
  redeemed_at?: string | null;
  validated_at?: string | null;
  created_at?: string | null;
  expires_at?: string | null;
  validated_by?: string | null;
}

export interface ProfileRow {
  id: string;
  email?: string | null;
  full_name?: string | null;
  name?: string | null;
  role?: "user" | "partner" | "staff" | "admin" | null;
  nxt_score?: number | null;
  nxt_level?: number | null;
  prx_coins?: number | null;
  terms_accepted_at?: string | null;
  terms_version?: string | null;
  wallet_balance?: number | string | null;
  avatar_url?: string | null;
  birth_date?: string | null;
  cpf?: string | null;
  phone?: string | null;
  created_at?: string | null;
}

export interface AuthUserLike {
  id: string;
  email?: string | null;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
}

export type MemberRole = "user" | "partner" | "staff" | "admin";

export function asMemberRole(value: unknown): MemberRole {
  return value === "admin" || value === "partner" || value === "staff" ? value : "user";
}

/** Opções do cookie de sessão (compatível com NextResponse.cookies.set). */
export interface SessionCookieOptions {
  name: string;
  value: string;
  httpOnly: boolean;
  secure?: boolean;
  sameSite: "lax" | "strict" | "none";
  path: string;
  maxAge?: number;
}
