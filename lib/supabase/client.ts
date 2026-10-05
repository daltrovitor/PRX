import { createBrowserClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.URL ||
  "https://ltiizrewiranhyrzbwds.supabase.co";

const supabaseAnonKey = (
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.ANON_KEY ||
  ""
).trim();

const supabaseServiceRoleKey = (
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SERVICE_ROLE_KEY ||
  ""
).trim();

/**
 * Chave pública do Supabase: a anon (JWT legado, "eyJ...") ou a publishable
 * ("sb_publishable_..."), que substitui a anon até o fim de 2026.
 */
export function isPublicSupabaseKey(key: string): boolean {
  const k = key.trim();
  return !k.includes("placeholder") && (k.startsWith("eyJ") || k.startsWith("sb_publishable_"));
}

/** Chave de servidor do Supabase: a service_role (JWT legado) ou a secret ("sb_secret_..."). */
export function isSecretSupabaseKey(key: string): boolean {
  const k = key.trim();
  return k.startsWith("eyJ") || k.startsWith("sb_secret_");
}

export const isLiveConfigured = isPublicSupabaseKey(supabaseAnonKey);

export const isUsingLiveSupabase = isLiveConfigured;

// Browser / Client SDK with SSR cookie storage for PKCE OAuth
export const supabase = isLiveConfigured
  ? createBrowserClient(supabaseUrl, supabaseAnonKey)
  : null;

// Server / Admin SDK for secure direct user creation without email confirmation
export const supabaseAdmin =
  isSecretSupabaseKey(supabaseServiceRoleKey)
    ? createClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      })
    : null;
