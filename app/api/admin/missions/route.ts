import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth";
import { passStore } from "@/lib/pass-store";
import { supabaseAdmin } from "@/lib/supabase/client";
import type { MissionRow } from "@/lib/db-rows";
import { incidentResponse } from "@/lib/incidents";

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyAdminRequest(req);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    // 1. Try Supabase
    if (supabaseAdmin) {
      const { data: dbMissions, error } = await supabaseAdmin
        .from("missions")
        .select("*")
        .order("created_at", { ascending: false });

      if (!error && dbMissions) {
        const mapped = dbMissions.map((m: MissionRow) => {
          let vType = m.verification_type;
          if (!vType) {
            const t = (m.title || "").toLowerCase();
            if (t.includes("convidar") || t.includes("amigo")) vType = "referral";
            else if (t.includes("voucher") || t.includes("benefício")) vType = "benefit_redeem";
            else if (t.includes("founders") || t.includes("pitch")) vType = "founders_pitch";
            else if (t.includes("run") || t.includes("corrida")) vType = "run_signup";
            else if (t.includes("bank") || t.includes("pix")) vType = "bank_pix";
            else if (t.includes("circle") || t.includes("unplug")) vType = "circle_connect";
            else vType = "manual";
          }
          return {
            id: m.id,
            title: m.title,
            description: m.description,
            xpReward: m.xp_reward,
            total: m.total,
            progress: m.progress,
            isCompleted: m.is_completed,
            verificationType: vType,
            category: m.category || (vType === "referral" ? "Comunidade" : "PRX"),
          };
        });
        return NextResponse.json({ success: true, missions: mapped });
      }
    }

    // 2. Fallback to passStore
    const missions = passStore.getMissions();
    return NextResponse.json({ success: true, missions });
  } catch (error) {
    return incidentResponse(error, "Erro ao consultar missões.");
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyAdminRequest(req);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await req.json();
    const { title, description, xpReward, total, progress, verificationType, category } = body;

    if (!title || !description || xpReward === undefined) {
      return NextResponse.json(
        { error: "Campos obrigatórios: Título, Descrição e Recompensa em XP." },
        { status: 400 }
      );
    }

    const targetTotal = Number(total) || 1;
    const currentProgress = Number(progress) || 0;
    const isCompleted = currentProgress >= targetTotal;
    const vType = verificationType || (title.toLowerCase().includes("convidar") || title.toLowerCase().includes("amigo") ? "referral" : "manual");
    const cat = category || (vType === "referral" ? "Comunidade" : "PRX");

    // 1. Try Supabase
    if (supabaseAdmin) {
      const { data: inserted, error } = await supabaseAdmin
        .from("missions")
        .insert({
          title: title.trim(),
          description: description.trim(),
          xp_reward: Number(xpReward),
          total: targetTotal,
          progress: currentProgress,
          is_completed: isCompleted,
        })
        .select()
        .single();

      if (!error && inserted) {
        const missionObj = {
          id: inserted.id,
          title: inserted.title,
          description: inserted.description,
          xpReward: inserted.xp_reward,
          total: inserted.total,
          progress: inserted.progress,
          isCompleted: inserted.is_completed,
          verificationType: vType,
          category: cat,
        };
        passStore.createMission(missionObj);
        return NextResponse.json({
          success: true,
          message: "Missão criada no Supabase com sucesso!",
          mission: missionObj,
        });
      }
    }

    // 2. Fallback to passStore
    const newMission = passStore.createMission({
      title: title.trim(),
      description: description.trim(),
      xpReward: Number(xpReward),
      progress: currentProgress,
      total: targetTotal,
      isCompleted,
      verificationType: vType,
      category: cat,
    });

    return NextResponse.json({
      success: true,
      message: "Missão criada com sucesso!",
      mission: newMission,
    });
  } catch (error) {
    return incidentResponse(error, "Erro ao criar missão.");
  }
}

export async function PUT(req: NextRequest) {
  try {
    const auth = await verifyAdminRequest(req);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await req.json();
    const { id, title, description, xpReward, total, progress, isCompleted } = body;

    if (!id) {
      return NextResponse.json({ error: "ID da missão é obrigatório." }, { status: 400 });
    }

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

    // 1. Try Supabase
    if (supabaseAdmin && isUuid) {
      const dbUpdates: Record<string, unknown> = {};
      if (title !== undefined) dbUpdates.title = title.trim();
      if (description !== undefined) dbUpdates.description = description.trim();
      if (xpReward !== undefined) dbUpdates.xp_reward = Number(xpReward);
      if (total !== undefined) dbUpdates.total = Number(total);
      if (progress !== undefined) dbUpdates.progress = Number(progress);
      if (isCompleted !== undefined) dbUpdates.is_completed = Boolean(isCompleted);

      const { data: updated, error } = await supabaseAdmin
        .from("missions")
        .update(dbUpdates)
        .eq("id", id)
        .select()
        .single();

      if (!error && updated) {
        passStore.updateMission(id, {
          title: updated.title,
          description: updated.description,
          xpReward: updated.xp_reward,
          total: updated.total,
          progress: updated.progress,
          isCompleted: updated.is_completed,
        });
        return NextResponse.json({
          success: true,
          message: "Missão atualizada no Supabase com sucesso!",
          mission: updated,
        });
      }
    }

    // 2. Fallback to passStore
    const updates: Record<string, unknown> = {};
    if (title !== undefined) updates.title = title.trim();
    if (description !== undefined) updates.description = description.trim();
    if (xpReward !== undefined) updates.xpReward = Number(xpReward);
    if (total !== undefined) updates.total = Number(total);
    if (progress !== undefined) updates.progress = Number(progress);
    if (isCompleted !== undefined) updates.isCompleted = Boolean(isCompleted);

    const updated = passStore.updateMission(id, updates);
    if (!updated) {
      return NextResponse.json({ error: "Missão não encontrada." }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: "Missão atualizada com sucesso!",
      mission: updated,
    });
  } catch (error) {
    return incidentResponse(error, "Erro ao atualizar missão.");
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const auth = await verifyAdminRequest(req);
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "ID da missão é obrigatório." }, { status: 400 });
    }

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

    // 1. Try Supabase
    if (supabaseAdmin && isUuid) {
      const { error } = await supabaseAdmin.from("missions").delete().eq("id", id);
      if (!error) {
        passStore.deleteMission(id);
        return NextResponse.json({
          success: true,
          message: "Missão removida do Supabase com sucesso!",
        });
      }
    }

    // 2. Fallback to passStore
    const deleted = passStore.deleteMission(id);
    if (!deleted) {
      return NextResponse.json({ error: "Missão não encontrada." }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: "Missão removida com sucesso!",
    });
  } catch (error) {
    return incidentResponse(error, "Erro ao excluir missão.");
  }
}
