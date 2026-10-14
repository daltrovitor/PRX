import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { passStore } from "@/lib/pass-store";
import { supabaseAdmin } from "@/lib/supabase/client";
import { incidentResponse } from "@/lib/incidents";

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: "Faça login para aceitar missões." }, { status: 401 });
    }

    const body = await req.json();
    const missionId = body.missionId?.trim();

    if (!missionId) {
      return NextResponse.json({ error: "ID da missão é obrigatório." }, { status: 400 });
    }

    // Accept in passStore
    const res = passStore.acceptMission(user.id, missionId);
    if (!res.success) {
      return NextResponse.json({ error: res.error || "Erro ao aceitar missão." }, { status: 400 });
    }

    // Persist in Supabase user_metadata if available
    if (supabaseAdmin) {
      try {
        const { data: authData } = await supabaseAdmin.auth.admin.getUserById(user.id);
        const meta = authData?.user?.user_metadata || {};
        const acceptedMap = meta.accepted_missions || {};
        acceptedMap[missionId] = {
          isAccepted: true,
          acceptedAt: new Date().toISOString(),
          progress: res.mission?.progress || 0,
          isCompleted: res.mission?.isCompleted || false,
        };

        await supabaseAdmin.auth.admin.updateUserById(user.id, {
          user_metadata: {
            ...meta,
            accepted_missions: acceptedMap,
          },
        });
      } catch (err) {
        console.warn("Notice updating accepted mission in Supabase:", err);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Missão "${res.mission?.title}" aceita com sucesso!`,
      mission: res.mission,
    });
  } catch (error) {
    return incidentResponse(error, "Erro ao aceitar missão.");
  }
}
