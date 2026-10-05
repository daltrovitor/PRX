// Hello World
import crypto from "crypto";
import { NextRequest, NextResponse, after } from "next/server";
import { z } from "zod";
import { checkRateLimit, sanitizeInput } from "@/lib/security";
import { CONSENT_REQUIRED_MESSAGE, TERMS_VERSION, recordConsent } from "@/lib/legal";
import { attachSession, publicUser } from "@/lib/accounts";
import { PartnerError } from "@/lib/partners/errors";
import { clientIp } from "@/lib/partners/http";
import { sendWelcomeEmail } from "@/lib/notifications/welcome";
import { signupBirthDateSchema } from "@/lib/family/age";
import { cpfSchema, onlyDigits } from "@/lib/family/types";
import { PENDING_GOOGLE_COOKIE, pendingGoogleCookie, verifyPendingGoogleToken } from "@/lib/google-pending";
import { supabaseAdmin } from "@/lib/supabase/client";
import { getCurrentUser, userStore, type StoredUser } from "@/lib/auth";

const phoneSchema = z
  .string()
  .trim()
  .transform(onlyDigits)
  .refine((d) => d.length === 10 || d.length === 11, "Informe o celular com DDD.");

const CompleteSchema = z.object({
  cpf: cpfSchema,
  phone: phoneSchema,
  // Idade mínima de 12 anos, a mesma do cadastro por e-mail.
  birthDate: signupBirthDateSchema,
  termsAccepted: z.literal(true, { error: CONSENT_REQUIRED_MESSAGE }),
});

interface Person {
  /** Conta de acesso já existente (perfil antigo incompleto ou sessão ativa). */
  authUserId?: string;
  email: string;
  fullName: string;
  avatarUrl: string;
  /** Conta de acesso criada só agora por esta conclusão (pode ser desfeita se algo falhar). */
  isNew: boolean;
  /** Cadastro novo: recebe o e-mail de boas-vindas. Não é o mesmo que isNew: o perfil vazio criado pelo gatilho do banco já existe. */
  welcome: boolean;
}

/** Quem está concluindo: o cadastro Google pendente (cookie assinado) ou o membro logado sem CPF/celular. */
async function whoIsCompleting(req: NextRequest): Promise<Person> {
  const token = req.cookies.get(PENDING_GOOGLE_COOKIE)?.value;
  const pending = token ? verifyPendingGoogleToken(token) : null;
  if (pending) {
    return {
      authUserId: pending.authUserId,
      email: pending.email,
      fullName: pending.fullName,
      avatarUrl: pending.avatarUrl || "",
      isNew: !pending.authUserId,
      welcome: pending.welcome ?? !pending.authUserId,
    };
  }
  const user = await getCurrentUser(req);
  if (user && user.role === "user" && (!user.cpf || !user.phone)) {
    return { authUserId: user.id, email: user.email, fullName: user.fullName, avatarUrl: user.avatarUrl, isNew: false, welcome: false };
  }
  throw new PartnerError("Sessão de cadastro expirada. Entre com o Google de novo.", 400);
}

/**
 * POST /api/auth/google/complete — conclui o cadastro: só aqui a conta é gravada
 * (perfil com CPF, celular e aceite dos Termos, com idade mínima de 12 anos). Antes disso não existe usuário
 * no banco, então quem desiste no meio não vira "usuário fantasma".
 */
// nosemgrep: prx-mutation-route-without-auth — conclusão do cadastro Google (cookie assinado do próprio fluxo ou sessão do membro)
export async function POST(req: NextRequest) {
  try {
    const rate = checkRateLimit(`google_complete_${clientIp(req) ?? "anon"}`, 8, 60);
    if (!rate.allowed) return NextResponse.json({ error: `Muitas tentativas. Tente em ${rate.resetInSeconds}s.` }, { status: 429 });

    const parsed = CompleteSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Dados inválidos." }, { status: 400 });
    const { cpf, phone } = parsed.data;

    const person = await whoIsCompleting(req);
    const email = person.email.toLowerCase().trim();
    const fullName = sanitizeInput(person.fullName.trim() || email.split("@")[0] || "Membro PRX");
    const now = new Date().toISOString();
    let finalUser: StoredUser;

    if (supabaseAdmin) {
      const { data: cpfOwner } = await supabaseAdmin.from("profiles").select("id").eq("cpf", cpf).maybeSingle();
      if (cpfOwner && cpfOwner.id !== person.authUserId) throw new PartnerError("Este CPF já está cadastrado no PRX. Entre na sua conta existente.", 409);

      let userId = person.authUserId;
      if (!userId) {
        // Conta de acesso criada agora, com e-mail confirmado: o próximo login com o Google se liga a ela.
        const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
          email,
          password: `G_${crypto.randomBytes(32).toString("base64url")}!`,
          email_confirm: true,
          user_metadata: { full_name: fullName, avatar_url: person.avatarUrl },
        });
        if (error || !created?.user) {
          const msg = (error?.message || "").toLowerCase();
          if (msg.includes("already") || msg.includes("exists")) throw new PartnerError("Este e-mail já tem conta no PRX. Entre com a senha ou com o Google.", 409);
          throw new PartnerError("Falha ao registrar a conta com o Google.", 500);
        }
        userId = created.user.id;
      }

      const { data: existing } = await supabaseAdmin.from("profiles").select("*").eq("id", userId).maybeSingle();
      const write = existing
        ? // Perfil antigo incompleto: só completa (pontos, nível e papel ficam como estão).
          supabaseAdmin.from("profiles").update({ cpf, phone, terms_accepted_at: now, terms_version: TERMS_VERSION, updated_at: now }).eq("id", userId)
        : supabaseAdmin.from("profiles").insert({
            id: userId,
            email,
            full_name: fullName,
            avatar_url: person.avatarUrl,
            cpf,
            phone,
            role: "user",
            nxt_score: 300,
            nxt_level: 1,
            wallet_balance: 0,
            terms_accepted_at: now,
            terms_version: TERMS_VERSION,
            updated_at: now,
          });
      const { data: profile, error: profileError } = await write.select("*").maybeSingle();
      if (profileError || !profile) {
        if (person.isNew) await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => undefined);
        throw new PartnerError(profileError?.code === "23505" ? "Este CPF já está cadastrado no PRX." : "Não foi possível salvar o cadastro.", profileError?.code === "23505" ? 409 : 500);
      }

      await recordConsent(userId);
      finalUser = {
        id: userId,
        email,
        fullName: profile.full_name || fullName,
        passwordHash: "",
        salt: "",
        role: "user",
        prxScore: profile.nxt_score ?? 300,
        prxLevel: profile.nxt_level ?? 1,
        avatarUrl: profile.avatar_url || person.avatarUrl,
        walletBalance: Number(profile.wallet_balance ?? 0),
        emailConfirmed: true,
        cpf,
        phone,
        createdAt: profile.created_at || now,
      };
    } else {
      // Desenvolvimento local (contas em memória).
      const taken = userStore.getAllUsers().find((u) => u.cpf === cpf && u.email !== email);
      if (taken) throw new PartnerError("Este CPF já está cadastrado no PRX. Entre na sua conta existente.", 409);
      finalUser = userStore.findOrCreateGoogleUser(email, fullName, person.avatarUrl, cpf, phone);
    }

    if (person.welcome) {
      const recipient = { id: finalUser.id, email, fullName: finalUser.fullName };
      after(() => sendWelcomeEmail(recipient));
    }

    const response = NextResponse.json({ success: true, message: "Cadastro concluído. Bem-vindo ao PRX!", user: publicUser(finalUser) });
    response.cookies.set(pendingGoogleCookie(""));
    return attachSession(response, finalUser);
  } catch (err) {
    if (err instanceof PartnerError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.warn("[google/complete] falha ao concluir o cadastro");
    return NextResponse.json({ error: "Erro ao concluir o cadastro com o Google." }, { status: 400 });
  }
}
