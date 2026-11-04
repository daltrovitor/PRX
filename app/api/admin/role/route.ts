import { NextRequest, NextResponse } from "next/server";
import { revokeAllSessions, userStore, verifyAdminRequest } from "@/lib/auth";
import { recordAdminAction } from "@/lib/admin/audit";
import { z } from "zod";
import { incidentResponse } from "@/lib/incidents";

const RoleUpdateSchema = z.object({
  emailOrId: z.string().min(1, "Identificador do usuário obrigatório"),
  newRole: z.enum(["user", "partner", "admin"]),
});

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyAdminRequest(req);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await req.json();
    const parseResult = RoleUpdateSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.issues[0]?.message || "Dados inválidos." },
        { status: 400 }
      );
    }

    const { emailOrId, newRole } = parseResult.data;

    let supabaseSuccess = false;
    let targetUser: Record<string, unknown> | null = null;

    // 1. Try Supabase
    try {
      const { supabaseAdmin } = await import("@/lib/supabase/client");
      if (supabaseAdmin) {
        let query = supabaseAdmin.from("profiles").select("*");
        if (emailOrId.includes("@")) {
          query = query.eq("email", emailOrId.toLowerCase().trim());
        } else {
          query = query.eq("id", emailOrId);
        }
        const { data: profile } = await query.maybeSingle();

        if (profile) {
          // Always update user_metadata in auth.users
          // app_metadata é a fonte confiável do papel (só a service role escreve nele);
          // user_metadata é mantido apenas para exibição legada.
          await supabaseAdmin.auth.admin.updateUserById(profile.id, {
            app_metadata: { role: newRole },
            user_metadata: { role: newRole },
          });

          // Attempt updating profiles table (might have check constraint)
          try {
            await supabaseAdmin.from("profiles").update({ role: newRole }).eq("id", profile.id);
          } catch (e) {
            console.warn("Profiles role column update constraint bypassed:", e);
          }

          // O JWT carrega o papel antigo: quem foi rebaixado perderia o acesso só quando o token vencesse.
          await revokeAllSessions(profile.id);

          targetUser = {
            id: profile.id,
            email: profile.email,
            name: profile.full_name || profile.name,
            role: newRole,
          };
          supabaseSuccess = true;
        }
      }
    } catch (e) {
      console.warn("Supabase role update notice:", e);
    }

    // 2. Also sync in-memory userStore
    const updated = userStore.updateRole(emailOrId, newRole);
    if (updated) {
      targetUser = {
        id: updated.id,
        email: updated.email,
        name: updated.fullName,
        role: updated.role,
      };
    }

    if (!supabaseSuccess && !updated) {
      return NextResponse.json(
        { error: "Usuário não encontrado." },
        { status: 404 }
      );
    }

    if (auth.adminUser) {
      await recordAdminAction(auth.adminUser, { action: "member.role_changed", targetType: "user", targetId: String(targetUser?.id ?? emailOrId), summary: `Papel alterado para ${newRole}` }, req);
    }

    return NextResponse.json({
      success: true,
      message: `Papel do usuário ${targetUser?.email || emailOrId} alterado com sucesso para '${newRole}'!`,
      user: targetUser,
    });
  } catch (error) {
    return incidentResponse(error, "Erro ao atualizar papel.");
  }
}
