// Hello World
import crypto from "crypto";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { getSessionSecret, DEMO_ACCOUNTS_ENABLED } from "@/lib/server-secrets";
import { isAllowlistedAdmin } from "@/lib/admin-allowlist";
import { asMemberRole } from "@/lib/db-rows";
import { calculatePrxLevel } from "@/lib/pass-data";

const AUTH_COOKIE_NAME = "prx_session";

/** Conteúdo assinado do token de sessão. */
export interface SessionPayload {
  sub: string;
  email: string;
  name?: string;
  role?: string;
  iat?: number;
  exp?: number;
}

/**
 * Papel confiável de um usuário do Supabase Auth.
 * app_metadata só pode ser escrito com a service role; user_metadata é editável
 * pelo próprio usuário via API pública e por isso nunca concede privilégio.
 */
function trustedAuthRole(authUser: { app_metadata?: Record<string, unknown> } | null | undefined): string | undefined {
  const role = authUser?.app_metadata?.role;
  return typeof role === "string" ? role : undefined;
}

export interface StoredUser {
  id: string;
  email: string;
  fullName: string;
  passwordHash: string;
  salt: string;
  role: "user" | "partner" | "staff" | "admin";
  prxScore: number;
  prxLevel: number;
  avatarUrl: string;
  walletBalance: number;
  emailConfirmed: boolean;
  cpf?: string;
  phone?: string;
  createdAt: string;
}

const DEFAULT_DEMO_USER = {
  id: "usr_demo_member",
  name: "Membro Demo",
  email: "membro@prx.dev",
  prxScore: 2150,
  prxLevel: 3,
  avatarUrl: "",
  // Conta digital ainda não ativada (sem BaaS): saldo real é zero.
  walletBalance: 0,
};

// Armazenamento em memória com contas de demonstração (apenas desenvolvimento local).
class UserStore {
  private users: Map<string, StoredUser> = new Map();

  constructor() {
    // Contas de demonstração só em desenvolvimento: em produção as senhas
    // abaixo estariam publicadas no repositório.
    if (!DEMO_ACCOUNTS_ENABLED) return;

    const salt = crypto.randomBytes(16).toString("hex");
    const passwordHash = this.hashPassword("Prx2026!", salt);

    // 1. Membro comum (role: 'user')
    const initialUser: StoredUser = {
      id: DEFAULT_DEMO_USER.id,
      email: DEFAULT_DEMO_USER.email.toLowerCase(),
      fullName: DEFAULT_DEMO_USER.name,
      passwordHash,
      salt,
      role: "user",
      prxScore: DEFAULT_DEMO_USER.prxScore,
      prxLevel: DEFAULT_DEMO_USER.prxLevel,
      avatarUrl: DEFAULT_DEMO_USER.avatarUrl,
      walletBalance: DEFAULT_DEMO_USER.walletBalance,
      emailConfirmed: true,
      // Cadastro completo, como o de qualquer membro (o mesmo CPF da abertura demo do PRX BANK).
      cpf: "52998224725",
      phone: "11988887777",
      createdAt: new Date().toISOString(),
    };
    this.users.set(initialUser.email, initialUser);

    // 2. Administrador (role: 'admin')
    const adminSalt = crypto.randomBytes(16).toString("hex");
    const adminUser: StoredUser = {
      id: "usr_demo_admin",
      email: "admin@prx.dev",
      fullName: "Admin Demo",
      passwordHash: this.hashPassword("AdminPrx2026!", adminSalt),
      salt: adminSalt,
      role: "admin",
      prxScore: 9999,
      prxLevel: 5,
      avatarUrl: "",
      walletBalance: 0,
      emailConfirmed: true,
      createdAt: new Date().toISOString(),
    };
    this.users.set(adminUser.email, adminUser);

    // 3. Partner demo account (role: 'partner')
    const partnerSalt = crypto.randomBytes(16).toString("hex");
    const partnerPassHash = this.hashPassword("PartnerPrx2026!", partnerSalt);
    const partnerUser: StoredUser = {
      id: "usr_partner_demo",
      email: "parceiro@prx.dev",
      fullName: "Parceiro Demo",
      passwordHash: partnerPassHash,
      salt: partnerSalt,
      role: "partner",
      prxScore: 1500,
      prxLevel: 3,
      avatarUrl: "",
      walletBalance: 0,
      emailConfirmed: true,
      createdAt: new Date().toISOString(),
    };
    this.users.set(partnerUser.email, partnerUser);

    // 4. Equipe PRX (role: 'staff'): valida ingressos e benefícios no portal staff.prx.app.br
    const staffSalt = crypto.randomBytes(16).toString("hex");
    const staffUser: StoredUser = {
      id: "usr_demo_staff",
      email: "staff@prx.dev",
      fullName: "Equipe Demo",
      passwordHash: this.hashPassword("StaffPrx2026!", staffSalt),
      salt: staffSalt,
      role: "staff",
      prxScore: 0,
      prxLevel: 1,
      avatarUrl: "",
      walletBalance: 0,
      emailConfirmed: true,
      createdAt: new Date().toISOString(),
    };
    this.users.set(staffUser.email, staffUser);
  }

  hashPassword(password: string, salt: string): string {
    return crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
  }

  findByEmail(email: string): StoredUser | undefined {
    return this.users.get(email.toLowerCase().trim());
  }

  findById(id: string): StoredUser | undefined {
    return Array.from(this.users.values()).find((u) => u.id === id);
  }

  getAllUsers(): StoredUser[] {
    return Array.from(this.users.values());
  }

  deleteUser(id: string): boolean {
    const user = this.findById(id);
    return user ? this.users.delete(user.email) : false;
  }

  updateRole(idOrEmail: string, newRole: "user" | "partner" | "staff" | "admin"): StoredUser | null {
    const user = this.findByEmail(idOrEmail) || this.findById(idOrEmail);
    if (!user) return null;
    user.role = newRole;
    this.users.set(user.email, user);
    return user;
  }

  updateUser(
    idOrEmail: string,
    updates: Partial<Pick<StoredUser, "prxLevel" | "prxScore" | "role" | "walletBalance">>
  ): StoredUser | null {
    const user = this.findByEmail(idOrEmail) || this.findById(idOrEmail);
    if (!user) return null;
    if (updates.prxLevel !== undefined) user.prxLevel = Number(updates.prxLevel);
    if (updates.prxScore !== undefined) user.prxScore = Number(updates.prxScore);
    if (updates.role !== undefined) user.role = updates.role;
    if (updates.walletBalance !== undefined) user.walletBalance = Number(updates.walletBalance);
    this.users.set(user.email, user);
    return user;
  }

  createUser(email: string, fullName: string, plainPassword: string, cpf?: string, phone?: string): StoredUser {
    const normalizedEmail = email.toLowerCase().trim();
    if (this.users.has(normalizedEmail)) {
      throw new Error("Este e-mail já está cadastrado.");
    }

    const salt = crypto.randomBytes(16).toString("hex");
    const passwordHash = this.hashPassword(plainPassword, salt);
    const id = `usr_${Date.now().toString(36)}_${crypto.randomBytes(4).toString("hex")}`;

    // All newly registered users strictly default to role: 'user'
    const newUser: StoredUser = {
      id,
      email: normalizedEmail,
      fullName: fullName.trim(),
      passwordHash,
      salt,
      role: "user",
      prxScore: 250, // Welcome bonus score
      prxLevel: 1,
      avatarUrl: "",
      walletBalance: 0,
      emailConfirmed: true, // Auto-confirm without email confirmation!
      cpf,
      phone,
      createdAt: new Date().toISOString(),
    };

    this.users.set(normalizedEmail, newUser);
    return newUser;
  }

  findOrCreateGoogleUser(email: string, fullName: string, avatarUrl?: string, cpf?: string, phone?: string): StoredUser {
    const normalizedEmail = email.toLowerCase().trim();
    const existing = this.users.get(normalizedEmail);
    if (existing) {
      if (avatarUrl && (!existing.avatarUrl || existing.avatarUrl.includes("unsplash"))) {
        existing.avatarUrl = avatarUrl;
      }
      if (cpf && !existing.cpf) existing.cpf = cpf;
      if (phone && !existing.phone) existing.phone = phone;
      return existing;
    }

    const salt = crypto.randomBytes(16).toString("hex");
    const passwordHash = this.hashPassword(crypto.randomBytes(24).toString("hex"), salt);
    const id = `usr_g_${Date.now().toString(36)}_${crypto.randomBytes(4).toString("hex")}`;

    const newUser: StoredUser = {
      id,
      email: normalizedEmail,
      fullName: fullName.trim() || normalizedEmail.split("@")[0],
      passwordHash,
      salt,
      role: "user",
      prxScore: 300, // Welcome bonus score
      prxLevel: 1,
      avatarUrl: avatarUrl || "",
      walletBalance: 0,
      emailConfirmed: true,
      cpf,
      phone,
      createdAt: new Date().toISOString(),
    };

    this.users.set(normalizedEmail, newUser);
    return newUser;
  }
}

/**
 * Uma única instância por processo. No Next, páginas (RSC) e rotas de API rodam
 * em instâncias de módulo separadas: sem o globalThis, uma conta criada pela API
 * (cadastro, login de parceiro criado no admin) não existiria para a página.
 */
const globalAuth = globalThis as unknown as { __prxUserStore?: UserStore };
if (globalAuth.__prxUserStore) Object.setPrototypeOf(globalAuth.__prxUserStore, UserStore.prototype);
export const userStore = (globalAuth.__prxUserStore ??= new UserStore());

/**
 * Sign JWT session token with configurable expiration
 */
export function createSessionToken(user: StoredUser, maxAgeSeconds: number = 7 * 24 * 60 * 60): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      sub: user.id,
      email: user.email,
      name: user.fullName,
      role: user.role,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + maxAgeSeconds,
    })
  ).toString("base64url");

  const signature = crypto
    .createHmac("sha256", getSessionSecret())
    .update(`${header}.${payload}`)
    .digest("base64url");

  return `${header}.${payload}.${signature}`;
}

/**
 * Verify JWT session token
 */
export function verifySessionToken(token: string): { valid: boolean; payload?: SessionPayload } {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return { valid: false };

    const [header, payload, signature] = parts;
    const expectedSig = crypto
      .createHmac("sha256", getSessionSecret())
      .update(`${header}.${payload}`)
      .digest("base64url");

    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
      return { valid: false };
    }

    const decodedPayload = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (decodedPayload.exp && decodedPayload.exp < Math.floor(Date.now() / 1000)) {
      return { valid: false };
    }

    return { valid: true, payload: decodedPayload };
  } catch (err) {
    return { valid: false };
  }
}

/**
 * Get current authenticated user from cookies, querying Supabase first and falling back to memory
 */
export async function getCurrentUser(req?: NextRequest): Promise<StoredUser | null> {
  try {
    let token: string | undefined;

    if (req) {
      token = req.cookies.get(AUTH_COOKIE_NAME)?.value;
      if (!token) {
        const raw = req.headers.get("cookie") || "";
        const match = raw.match(new RegExp(`(?:^|;\\s*)${AUTH_COOKIE_NAME}=([^;]+)`));
        if (match) token = match[1];
      }
    }

    if (!token) {
      try {
        const cookieStore = await cookies();
        token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
      } catch {}
    }

    if (!token) return null;

    const verification = verifySessionToken(token);
    if (!verification.valid || !verification.payload?.sub) return null;
    return await loadSessionUser(verification.payload.sub, verification.payload);
  } catch {
    return null;
  }
}

/**
 * Carrega o usuário de uma sessão pelo id (perfil no Supabase, com a memória de
 * demonstração como reserva). Usado pelo cookie de sessão e pela entrada com
 * biometria, que precisa emitir uma sessão nova sem senha.
 */
export async function loadSessionUser(userId: string, hint: { email?: string; role?: string; name?: string } = {}): Promise<StoredUser | null> {
  try {
    // 1. Try querying Supabase public.profiles if supabaseAdmin is available
    try {
      const { supabaseAdmin } = await import("@/lib/supabase/client");
      if (supabaseAdmin) {
        const isUuid = userId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);
        let profile = null;
        if (isUuid) {
          const { data } = await supabaseAdmin
            .from("profiles")
            .select("*")
            .eq("id", userId)
            .maybeSingle();
          profile = data;
        }
        if (!profile && hint.email) {
          const { data } = await supabaseAdmin
            .from("profiles")
            .select("*")
            .eq("email", hint.email.toLowerCase().trim())
            .maybeSingle();
          profile = data;
        }

        if (profile) {
          let userRole = asMemberRole(profile.role || hint.role);
          const userEmail = (profile.email || hint.email || "").toLowerCase().trim();
          if (userRole !== "admin" && isAllowlistedAdmin(userEmail)) {
            userRole = "admin";
          }
          if (userRole === "user" && isUuid) {
            try {
              const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId);
              const appRole = trustedAuthRole(authUser?.user);
              if (appRole) {
                userRole = asMemberRole(appRole);
              }
            } catch {}
          }

          return {
            id: profile.id,
            email: profile.email || hint.email || "",
            fullName: profile.full_name || profile.name || hint.name || "Membro PRX",
            passwordHash: "",
            salt: "",
            role: userRole,
            prxScore: profile.nxt_score ?? 250,
            // Nível sempre derivado do XP pela régua infinita (nxt_level de antes da régua nova pode estar defasado).
            prxLevel: calculatePrxLevel(profile.nxt_score ?? 250),
            avatarUrl: profile.avatar_url || "",
            walletBalance: Number(profile.wallet_balance ?? 0),
            emailConfirmed: true,
            cpf: profile.cpf || undefined,
            phone: profile.phone || undefined,
            createdAt: profile.created_at || new Date().toISOString(),
          };
        }
      }
    } catch (dbErr) {
      console.warn("Supabase profile lookup notice:", dbErr);
    }

    // 2. Fallback to in-memory store (e.g. demo accounts or fallback mode)
    const user = userStore.findById(userId) || (hint.email ? userStore.findByEmail(hint.email) : undefined);
    return user ? { ...user, prxLevel: calculatePrxLevel(user.prxScore) } : null;
  } catch {
    return null;
  }
}

export { AUTH_COOKIE_NAME };

/**
 * Universal verification for admin requests supporting req.cookies, headers, and next/headers
 */
export async function verifyAdminRequest(req?: NextRequest): Promise<{
  authorized: boolean;
  status: number;
  error?: string;
  adminUser?: SessionPayload;
}> {
  let token: string | undefined;

  if (req) {
    token = req.cookies.get(AUTH_COOKIE_NAME)?.value;
  }
  if (!token && req) {
    const raw = req.headers.get("cookie") || "";
    const match = raw.match(new RegExp(`(?:^|;\\s*)${AUTH_COOKIE_NAME}=([^;]+)`));
    if (match) token = match[1];
  }
  if (!token) {
    try {
      const cookieStore = await cookies();
      token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
    } catch {}
  }

  if (!token) {
    return { authorized: false, status: 401, error: "Não autenticado." };
  }

  const { valid, payload } = verifySessionToken(token);
  if (!valid || !payload) {
    return { authorized: false, status: 401, error: "Sessão inválida ou expirada." };
  }

  // 1. Direct role check
  let role = payload.role;

  // 2. Admin email whitelist
  const userEmail = (payload.email || "").toLowerCase().trim();
  if (isAllowlistedAdmin(userEmail)) {
    role = "admin";
  }

  // 3. Supabase profiles check
  if (role !== "admin") {
    try {
      const { supabaseAdmin } = await import("@/lib/supabase/client");
      if (supabaseAdmin) {
        const isUuid = payload.sub && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payload.sub);
        let p = null;
        if (isUuid) {
          const { data } = await supabaseAdmin
            .from("profiles")
            .select("role")
            .eq("id", payload.sub)
            .maybeSingle();
          p = data;
        }
        if (!p && userEmail) {
          const { data } = await supabaseAdmin
            .from("profiles")
            .select("role")
            .eq("email", userEmail)
            .maybeSingle();
          p = data;
        }

        if (p?.role === "admin") {
          role = "admin";
        } else if (isUuid) {
          const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(payload.sub);
          if (trustedAuthRole(authUser?.user) === "admin") {
            role = "admin";
          }
        }
      }
    } catch {}
  }

  // 4. In-memory userStore fallback
  if (role !== "admin") {
    const memUser = (payload.sub ? userStore.findById(payload.sub) : null) || (userEmail ? userStore.findByEmail(userEmail) : null);
    if (memUser?.role === "admin") {
      role = "admin";
    }
  }

  if (role !== "admin") {
    return {
      authorized: false,
      status: 403,
      error: "Acesso Negado. Requer privilégios de administrador (role = 'admin').",
    };
  }

  return { authorized: true, status: 200, adminUser: { ...payload, role: "admin" } };
}

/**
 * Universal verification for partner requests supporting req.cookies, headers, and next/headers
 */
export async function verifyPartnerRequest(req?: NextRequest): Promise<{
  authorized: boolean;
  status: number;
  error?: string;
  partnerUser?: SessionPayload;
}> {
  let token: string | undefined;

  if (req) {
    token = req.cookies.get(AUTH_COOKIE_NAME)?.value;
  }
  if (!token && req) {
    const raw = req.headers.get("cookie") || "";
    const match = raw.match(new RegExp(`(?:^|;\\s*)${AUTH_COOKIE_NAME}=([^;]+)`));
    if (match) token = match[1];
  }
  if (!token) {
    try {
      const cookieStore = await cookies();
      token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
    } catch {}
  }

  if (!token) {
    return { authorized: false, status: 401, error: "Não autenticado." };
  }

  const { valid, payload } = verifySessionToken(token);
  if (!valid || !payload) {
    return { authorized: false, status: 401, error: "Sessão inválida ou expirada." };
  }

  let role = payload.role;
  const userEmail = payload.email?.toLowerCase().trim();

  // 1. Fallback to Supabase if not yet partner
  if (role !== "partner" && payload.sub) {
    try {
      const { supabaseAdmin } = await import("@/lib/supabase/client");
      if (supabaseAdmin) {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payload.sub);
        let p: { role?: string | null } | null = null;
        if (isUuid) {
          const { data } = await supabaseAdmin
            .from("profiles")
            .select("role")
            .eq("id", payload.sub)
            .maybeSingle();
          p = data;
        } else if (userEmail) {
          const { data } = await supabaseAdmin
            .from("profiles")
            .select("role")
            .eq("email", userEmail)
            .maybeSingle();
          p = data;
        }

        if (p?.role === "partner") {
          role = "partner";
        } else if (isUuid) {
          const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(payload.sub);
          if (trustedAuthRole(authUser?.user) === "partner") {
            role = "partner";
          }
        }
      }
    } catch {}
  }

  // 2. Fallback to in-memory userStore
  if (role !== "partner") {
    const memUser = (payload.sub ? userStore.findById(payload.sub) : null) || (userEmail ? userStore.findByEmail(userEmail) : null);
    if (memUser?.role === "partner") {
      role = "partner";
    }
  }

  if (role !== "partner") {
    return {
      authorized: false,
      status: 403,
      error: "Acesso Negado. Requer privilégios de parceiro (role = 'partner').",
    };
  }

  return { authorized: true, status: 200, partnerUser: { ...payload, role } };
}

/**
 * Sessão do portal da Equipe PRX (staff.prx.app.br). Aceita papel "staff" e também
 * administradores, que validam ingressos e benefícios sem restrição.
 * As permissões finas do funcionário ficam em staff_members (lib/staff).
 */
export async function verifyStaffRequest(req?: NextRequest): Promise<{
  authorized: boolean;
  status: number;
  error?: string;
  staffUser?: SessionPayload & { role: "staff" | "admin" };
}> {
  const admin = await verifyAdminRequest(req);
  if (admin.authorized && admin.adminUser) return { authorized: true, status: 200, staffUser: { ...admin.adminUser, role: "admin" } };
  if (admin.status === 401) return { authorized: false, status: 401, error: admin.error };

  let token: string | undefined = req?.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (!token) {
    try {
      token = (await cookies()).get(AUTH_COOKIE_NAME)?.value;
    } catch {}
  }
  const { valid, payload } = token ? verifySessionToken(token) : { valid: false, payload: undefined };
  if (!valid || !payload) return { authorized: false, status: 401, error: "Sessão inválida ou expirada." };

  let role = payload.role;
  if (role !== "staff") {
    try {
      const { supabaseAdmin } = await import("@/lib/supabase/client");
      if (supabaseAdmin && /^[0-9a-f-]{36}$/i.test(payload.sub)) {
        const { data } = await supabaseAdmin.from("profiles").select("role").eq("id", payload.sub).maybeSingle();
        if (data?.role === "staff") role = "staff";
        else {
          const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(payload.sub);
          if (trustedAuthRole(authUser?.user) === "staff") role = "staff";
        }
      }
    } catch {}
  }
  if (role !== "staff") {
    const memUser = userStore.findById(payload.sub) || (payload.email ? userStore.findByEmail(payload.email) : undefined);
    if (memUser?.role === "staff") role = "staff";
  }
  if (role !== "staff") return { authorized: false, status: 403, error: "Acesso só para a Equipe PRX." };
  return { authorized: true, status: 200, staffUser: { ...payload, role: "staff" } };
}
