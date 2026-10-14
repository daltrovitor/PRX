// Hello World
import { NextRequest, NextResponse } from "next/server";
import { calculatePrxLevel } from "@/lib/pass-data";
import { getWalletRepository } from "@/lib/points/repository";
import { getCurrentUser, userStore } from "@/lib/auth";
import { passStore } from "@/lib/pass-store";
import { supabaseAdmin } from "@/lib/supabase/client";
import { liveMissionCounts } from "@/lib/live/service";
import { incidentResponse } from "@/lib/incidents";


export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: "Faça login para verificar missões." }, { status: 401 });
    }

    const body = await req.json();
    const missionId = body.missionId?.trim();
    const actionData = body.actionData;

    if (!missionId) {
      return NextResponse.json({ error: "ID da missão é obrigatório." }, { status: 400 });
    }

    // Check user vouchers count in Supabase to assist benefit_redeem verification
    let vouchersCount = 0;
    if (supabaseAdmin) {
      try {
        const { count } = await supabaseAdmin
          .from("vouchers")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id);
        vouchersCount = count || 0;
      } catch {}
    }
    const storeVouchersCount = passStore.getUserVouchers(user.id).length;
    const effectiveVouchersCount = Math.max(vouchersCount, storeVouchersCount);

    // Missões do PRX LIVE conferem os dados reais: check-in na portaria, inscrição na RUN, startup enviada.
    const live = await liveMissionCounts(user.id).catch(() => ({ checkins: 0, runSignups: 0, foundersSubmissions: 0 }));
    const result = passStore.verifyMission(user.id, missionId, {
      userVouchersCount: effectiveVouchersCount,
      liveCheckins: live.checkins,
      runSignups: live.runSignups,
      foundersSubmissions: live.foundersSubmissions,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.message }, { status: 400 });
    }

    let updatedScore = user.prxScore || 250;
    let updatedLevel = user.prxLevel || 1;

    // If newly completed and has XP to award
    if (result.completed && result.xpEarned > 0) {
      // XP pelo extrato de pontos (atômico e idempotente por missão); sem a migração 20260927, soma direto no perfil.
      try {
        const applied = await getWalletRepository(user.id).apply(user.id, {
          coinsDelta: 0,
          xpDelta: result.xpEarned,
          source: "mission",
          referenceId: `mission:${missionId}`,
          description: passStore.getMissionById(missionId)?.title ?? "Missão concluída",
        });
        updatedScore = applied.xp;
        updatedLevel = applied.level;
      } catch {
        updatedScore += result.xpEarned;
        updatedLevel = calculatePrxLevel(updatedScore);
      }

      // Keep userStore in-memory synced
      userStore.updateUser(user.id, {
        prxScore: updatedScore,
        prxLevel: updatedLevel,
      });

      if (supabaseAdmin) {
        try {
          await supabaseAdmin
            .from("profiles")
            .update({
              nxt_score: updatedScore,
              nxt_level: updatedLevel,
            })
            .eq("id", user.id);

          const { data: authData } = await supabaseAdmin.auth.admin.getUserById(user.id);
          const meta = authData?.user?.user_metadata || {};
          const acceptedMap = meta.accepted_missions || {};
          acceptedMap[missionId] = {
            isAccepted: true,
            isCompleted: true,
            progress: result.progress,
            actionData: actionData || undefined,
            completedAt: new Date().toISOString(),
          };

          await supabaseAdmin.auth.admin.updateUserById(user.id, {
            user_metadata: {
              ...meta,
              nxt_score: updatedScore,
              nxt_level: updatedLevel,
              accepted_missions: acceptedMap,
            },
          });
        } catch (dbErr) {
          console.warn("Notice updating profile on mission verification:", dbErr);
        }
      }
    }

    return NextResponse.json({
      success: true,
      completed: result.completed,
      progress: result.progress,
      total: result.total,
      xpEarned: result.xpEarned,
      message: result.message,
      currentUser: {
        id: user.id,
        name: user.fullName,
        prxScore: updatedScore,
        prxLevel: updatedLevel,
      },
    });
  } catch (error) {
    return incidentResponse(error, "Erro ao verificar missão.");
  }
}
