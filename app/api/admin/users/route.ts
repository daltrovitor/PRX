// Hello World
import { NextRequest, NextResponse } from "next/server";
import { calculatePrxLevel, xpForLevel } from "@/lib/pass-data";
import { userStore, verifyAdminRequest } from "@/lib/auth";
import { passStore } from "@/lib/pass-store";
import { isRegisteredMember } from "@/lib/members";
import { recordAdminAction } from "@/lib/admin/audit";
import type { AuthUserLike } from "@/lib/db-rows";
import { incidentResponse } from "@/lib/incidents";

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyAdminRequest(req);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    // 1. Try querying Supabase public.profiles for real registered members
    let users: Array<Record<string, unknown>> = [];
    try {
      const { supabaseAdmin } = await import("@/lib/supabase/client");
      if (supabaseAdmin) {
        const { data: dbProfiles, error } = await supabaseAdmin
          .from("profiles")
          .select("*")
          .order("created_at", { ascending: false });

        if (!error && dbProfiles && dbProfiles.length > 0) {
          // Fetch auth users to also read user_metadata.role
          const authRolesMap = new Map<string, string>();
          try {
            const { data: authUsersData } = await supabaseAdmin.auth.admin.listUsers();
            if (authUsersData?.users) {
              authUsersData.users.forEach((u: AuthUserLike) => {
                // Only app_metadata is trusted: user_metadata can be edited by the user.
                const trustedRole = u.app_metadata?.role;
                if (typeof trustedRole === "string") {
                  authRolesMap.set(u.id, trustedRole);
                  if (u.email) authRolesMap.set(u.email.toLowerCase(), trustedRole);
                }
              });
            }
          } catch {}

            // Query bank accounts for PRX BANK balance
            const bankMap = new Map<string, { balance: number; status: string }>();
            try {
              const { data: bankData } = await supabaseAdmin.from("bank_accounts").select("user_id, balance, status");
              if (bankData) {
                for (const b of bankData) {
                  bankMap.set(b.user_id, { balance: Number(b.balance || 0), status: b.status || "active" });
                }
              }
            } catch (bankErr) {
              console.warn("Supabase bank_accounts query error:", bankErr);
            }

            // A Conta Pai e os filhos guardam o CPF na identidade de família, não no perfil.
            const familyCpf = new Map<string, string>();
            try {
              const { data: identities } = await supabaseAdmin.from("family_identities").select("user_id, cpf");
              for (const row of identities ?? []) familyCpf.set(String(row.user_id), String(row.cpf ?? ""));
            } catch {}

            users = dbProfiles.flatMap((p) => {
              const userVouchers = passStore.getUserVouchers(p.id);
              const metadataRole = authRolesMap.get(p.id) || (p.email ? authRolesMap.get(p.email.toLowerCase()) : null);
              const effectiveRole = p.role !== "user" ? p.role : (metadataRole || p.role || "user");
              // Sem CPF válido não é membro: o Supabase cria o perfil assim que o Google entra, antes do cadastro.
              if (!isRegisteredMember({ role: effectiveRole, cpf: p.cpf }, familyCpf.get(p.id))) return [];
              const bankInfo = bankMap.get(p.id);

              return [{
                id: p.id,
                email: p.email,
                name: p.full_name || p.name || p.email.split("@")[0],
                role: effectiveRole,
                prxScore: p.nxt_score ?? 250,
                prxLevel: calculatePrxLevel(p.nxt_score ?? 250),
                walletBalance: Number(p.wallet_balance || 0),
                bankBalance: bankInfo ? bankInfo.balance : 0,
                bankStatus: bankInfo ? bankInfo.status : "active",
                createdAt: p.created_at,
                vouchersCount: userVouchers.length,
                vouchers: userVouchers,
              }];
            });
          }
        }
      } catch (e) {
        console.warn("Supabase profiles query error:", e);
      }

      // 2. Fallback to userStore only if Supabase has no records
      if (users.length === 0) {
        const { getBankRepository } = await import("@/lib/bank/repository");
        const allUsers = userStore.getAllUsers().filter((u) => isRegisteredMember({ role: u.role, cpf: u.cpf }));
        users = await Promise.all(
          allUsers.map(async (u) => {
            const userVouchers = passStore.getUserVouchers(u.id);
            const bankAcc = await getBankRepository(u.id).getOrCreateAccount(u.id);
            return {
              id: u.id,
              email: u.email,
              name: u.fullName,
              role: u.role,
              prxScore: u.prxScore,
              prxLevel: u.prxLevel,
              walletBalance: u.walletBalance,
              bankBalance: bankAcc.balance,
              bankStatus: bankAcc.status,
              createdAt: u.createdAt,
              vouchersCount: userVouchers.length,
              vouchers: userVouchers,
            };
          })
        );
      }

      return NextResponse.json({
        success: true,
        currentUserRole: auth.adminUser?.role,
        users,
    });
  } catch (error) {
    return incidentResponse(error, "Erro ao consultar usuários.");
  }
}

export async function PUT(req: NextRequest) {
  try {
    const auth = await verifyAdminRequest(req);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await req.json();
    const { id, email, role } = body;
    // Régua infinita: nível e XP andam juntos. XP informado define o nível; só o nível
    // informado leva o XP ao piso daquele nível.
    const scoreInput = body.prxScore !== undefined && body.prxScore !== "" ? Math.max(0, Math.floor(Number(body.prxScore) || 0)) : undefined;
    const levelInput = body.prxLevel !== undefined && body.prxLevel !== "" ? Math.max(1, Math.floor(Number(body.prxLevel) || 1)) : undefined;
    const prxScore = scoreInput ?? (levelInput !== undefined ? xpForLevel(levelInput) : undefined);
    const prxLevel = prxScore !== undefined ? calculatePrxLevel(prxScore) : undefined;
    if (role !== undefined && !["user", "partner", "admin"].includes(role)) {
      return NextResponse.json({ error: "Papel inválido. A Equipe PRX é gerenciada na aba Equipe." }, { status: 400 });
    }

    const targetKey = id || email;
    if (!targetKey) {
      return NextResponse.json(
        { error: "Informe o ID ou e-mail do usuário para atualizar." },
        { status: 400 }
      );
    }

    let userFound = false;
    let returnUser: Record<string, unknown> | null = null;

    // 1. Try updating Supabase public.profiles and auth.users
    try {
      const { supabaseAdmin } = await import("@/lib/supabase/client");
      if (supabaseAdmin) {
        // Find user by id or email
        let profileQuery = supabaseAdmin.from("profiles").select("*");
        if (id) {
          profileQuery = profileQuery.eq("id", id);
        } else {
          profileQuery = profileQuery.eq("email", email.toLowerCase());
        }
        const { data: currentProfile } = await profileQuery.maybeSingle();

        const targetUserId = currentProfile?.id || (id ? id : null);

        // A) Update role in auth.users user_metadata if role is specified
        if (targetUserId && role !== undefined) {
          try {
            await supabaseAdmin.auth.admin.updateUserById(targetUserId, {
              app_metadata: { role },
              user_metadata: { role },
            });
          } catch (metaErr) {
            console.warn("Notice: user_metadata update:", metaErr);
          }
        }

        // B) Update fields in profiles table
        const updatePayload: Record<string, unknown> = {};
        if (prxLevel !== undefined) updatePayload.nxt_level = Number(prxLevel);
        if (prxScore !== undefined) updatePayload.nxt_score = Number(prxScore);
        if (role !== undefined) updatePayload.role = role;

        if (Object.keys(updatePayload).length > 0) {
          let updateQuery = supabaseAdmin.from("profiles").update(updatePayload);
          if (id) {
            updateQuery = updateQuery.eq("id", id);
          } else {
            updateQuery = updateQuery.eq("email", email.toLowerCase());
          }

          const firstAttempt = Object.keys(updatePayload).length > 0 ? await updateQuery.select().maybeSingle() : { data: currentProfile, error: null };
          const updateError = firstAttempt.error;
          let updatedProfile = firstAttempt.data;

          // If profiles update failed due to check constraint on 'role' (Postgres error 23514)
          if (updateError && updateError.code === "23514" && updatePayload.role) {
            console.warn("Profiles check constraint encountered. Updating profile without 'role' and keeping role in user_metadata.");
            delete updatePayload.role;

            let retryQuery = supabaseAdmin.from("profiles").update(updatePayload);
            if (id) {
              retryQuery = retryQuery.eq("id", id);
            } else {
              retryQuery = retryQuery.eq("email", email.toLowerCase());
            }
            const retryRes = await retryQuery.select().maybeSingle();
            updatedProfile = retryRes.data;
          }

          if (updatedProfile || currentProfile) {
            const p = updatedProfile || currentProfile;
            userFound = true;
            returnUser = {
              id: p.id,
              email: p.email,
              name: p.full_name || p.name || p.email.split("@")[0],
              role: role !== undefined ? role : p.role,
              prxLevel: updatedProfile?.nxt_level ?? p.nxt_level,
              prxScore: updatedProfile?.nxt_score ?? p.nxt_score,
              walletBalance: Number(updatedProfile?.wallet_balance ?? p.wallet_balance ?? 0),
            };
          }
        }
      }
    } catch (e) {
      console.warn("Supabase update process error:", e);
    }

    // 2. Also update in userStore (or fallback)
    const updatedStore = userStore.updateUser(targetKey, {
      prxLevel: prxLevel !== undefined ? Number(prxLevel) : undefined,
      prxScore: prxScore !== undefined ? Number(prxScore) : undefined,
      role: role !== undefined ? role : undefined,
    });

    if (updatedStore) {
      userFound = true;
      if (!returnUser) {
        returnUser = {
          id: updatedStore.id,
          email: updatedStore.email,
          name: updatedStore.fullName,
          role: updatedStore.role,
          prxLevel: updatedStore.prxLevel,
          prxScore: updatedStore.prxScore,
          walletBalance: updatedStore.walletBalance,
        };
      }
    }

    if (!userFound || !returnUser) {
      return NextResponse.json(
        { error: "Usuário não encontrado." },
        { status: 404 }
      );
    }

    if (auth.adminUser) {
      await recordAdminAction(
        auth.adminUser,
        { action: "member.updated", targetType: "user", targetId: String(returnUser.id ?? targetKey), summary: `Membro atualizado${role !== undefined ? `: papel ${role}` : ""}${prxScore !== undefined ? ` · XP ${prxScore}` : ""}`, meta: { role, prxScore } },
        req
      );
    }

    return NextResponse.json({
      success: true,
      message: `Dados do membro ${returnUser.name} atualizados com sucesso!`,
      user: returnUser,
    });
  } catch (error) {
    return incidentResponse(error, "Erro ao atualizar dados do membro.");
  }
}
