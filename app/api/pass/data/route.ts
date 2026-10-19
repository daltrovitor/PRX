// Hello World
import { pgQuote } from "@/lib/postgrest";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { passStore, SystemVoucher } from "@/lib/pass-store";
import { supabaseAdmin } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/errors";
import type { BenefitRow, MissionRow, VoucherRow } from "@/lib/db-rows";
import type { Benefit, MissionVerificationType, PassMission } from "@/lib/pass-data";
import { availabilityIssue, mapBenefitRow, partnerBadges, partnerStatuses } from "@/lib/partners/catalog";
import { mergeBadges, type BadgeCode } from "@/lib/badges/catalog";
import { planRank } from "@/lib/partners/plans";
import { incidentResponse } from "@/lib/incidents";

function isUuid(id?: string | null): boolean {
  if (!id) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

/** Benefício como o membro vê: sem custo, receita por resgate nem comissão. */
function forMember(benefit: Benefit): Benefit {
  const copy = { ...benefit };
  delete copy.costPrice;
  delete copy.prxRevenuePerRedemption;
  delete copy.partnerFeePct;
  return copy;
}

async function visibleCatalog(benefits: Benefit[]): Promise<Benefit[]> {
  const now = new Date();
  const candidates = benefits.filter((b) => availabilityIssue(b, now) === null);
  const partnerIds = candidates.map((b) => b.partnerId);
  // Selo do parceiro vale para todos os benefícios dele; falha aqui não esconde o catálogo.
  const badgesRequest = partnerBadges(partnerIds).catch(() => new Map<string, BadgeCode[]>());
  let statuses = new Map<string, string>();
  try {
    statuses = await partnerStatuses(partnerIds);
  } catch (err) {
    // Sem as tabelas de parceiros (migração pendente) nenhum benefício é validável.
    console.warn("Catálogo sem status de parceiros:", errorMessage(err));
    return [];
  }
  const badges = await badgesRequest;
  return candidates
    .filter((b) => statuses.get(b.partnerId) === "ATIVO" || statuses.get(b.partnerId) === "PENDENTE")
    .map((b) => ({ ...b, badges: mergeBadges(b.badges, badges.get(b.partnerId)) }))
    .map((b, index) => ({ b, index }))
    .sort((x, y) => planRank(y.b.visibilityPlan) - planRank(x.b.visibilityPlan) || x.index - y.index)
    .map(({ b }) => b);
}

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    let benefits: Benefit[] = [];
    let missions: PassMission[] = [];
    let userVouchers: SystemVoucher[] = [];
    let supabaseBenefitsQueried = false;
    let supabaseMissionsQueried = false;

    // 1. Try Supabase
    if (supabaseAdmin) {
      try {
        const [resBenefits, resMissions] = await Promise.all([
          supabaseAdmin.from("benefits").select("*").eq("is_active", true).order("created_at", { ascending: false }),
          supabaseAdmin.from("missions").select("*").order("created_at", { ascending: false }),
        ]);

        if (!resBenefits.error && Array.isArray(resBenefits.data)) {
          supabaseBenefitsQueried = true;
          benefits = resBenefits.data.map((b: BenefitRow) => mapBenefitRow(b));

          // Keep passStore strictly synced with current Supabase benefits
          passStore.setBenefits(benefits);
        }

        if (resMissions.data) {
          supabaseMissionsQueried = true;
          missions = resMissions.data.map((m: MissionRow) => {
            let vType = (m.verification_type || undefined) as MissionVerificationType | undefined;
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
              description: m.description ?? "",
              xpReward: m.xp_reward,
              total: m.total,
              progress: m.progress || 0,
              isCompleted: m.is_completed || false,
              verificationType: vType,
              category: m.category || (vType === "referral" ? "Comunidade" : "PRX"),
            };
          });

          // Sync passStore
          missions.forEach((m) => {
            if (!passStore.getMissionById(m.id)) {
              passStore.createMission(m);
            }
          });
        }

        if (user) {
          let voucherQuery = supabaseAdmin
            .from("vouchers")
            .select("*")
            .order("created_at", { ascending: false });

          if (isUuid(user.id) && user.email) {
            voucherQuery = voucherQuery.or(`user_id.eq.${pgQuote(user.id)},user_email.eq.${pgQuote(user.email)}`);
          } else if (isUuid(user.id)) {
            voucherQuery = voucherQuery.eq("user_id", user.id);
          } else if (user.email) {
            voucherQuery = voucherQuery.eq("user_email", user.email);
          }

          const { data: dbVouchers, error: voucherErr } = await voucherQuery;

          if (!voucherErr && dbVouchers && dbVouchers.length > 0) {
            userVouchers = dbVouchers.map((v: VoucherRow) => ({
              id: v.id,
              code: v.code,
              benefitId: v.benefit_id ?? "",
              benefitTitle: v.benefit_title ?? "",
              partnerId: v.partner_id || "",
              partnerName: v.partner_name ?? "",
              expiresAt: v.expires_at ?? null,
              discountLabel: v.discount_label ?? "",
              status: v.status,
              qrPayload: v.qr_payload ?? "",
              redeemedAt: new Date(v.redeemed_at || v.created_at || Date.now()).toLocaleString("pt-BR", {
                day: "2-digit",
                month: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              }),
              terms: v.terms || "Apresente o QR Code no balcão.",
              userId: v.user_id || user.id,
              userEmail: v.user_email || user.email,
              userName: v.user_name || user.fullName,
            }));

            // Sync into passStore cache
            userVouchers.forEach((sv) => {
              passStore.createVoucher(sv);
            });
          }
        }
      } catch (dbErr) {
        console.warn("Supabase pass data lookup notice:", dbErr);
      }
    }

    // 2. Fallback to passStore only if Supabase was not configured or failed
    if (!supabaseBenefitsQueried) {
      benefits = passStore.getBenefits();
    }
    // Clean out any IronBox benefit
    benefits = benefits.filter(
      (b) =>
        !b.partnerName?.toLowerCase().includes("ironbox") &&
        !b.title?.toLowerCase().includes("ironbox")
    );

    // Catálogo só com o que pode ser validado hoje: benefício com parceiro dono,
    // dentro da vigência e de parceria ativa. Mídia paga sobe na ordem (cláusula 15.1).
    benefits = await visibleCatalog(benefits);

    if (missions.length === 0) {
      // Initialize with PDF templates
      const storeMissions = passStore.getMissions();
      if (storeMissions.length === 0) {
        const { PDF_MISSION_TEMPLATES } = await import("@/lib/pass-data");
        PDF_MISSION_TEMPLATES.forEach((tmpl) => {
          passStore.createMission(tmpl);
        });
      }
      missions = passStore.getMissions();
    }

    // Merge user personalized state for missions if user logged in
    if (user) {
      const userMissionMap = passStore.getUserMissions(user.id);
      missions = missions.map((m) => {
        const userState = userMissionMap.find((um) => um.id === m.id);
        const isReferral =
          m.verificationType === "referral" ||
          m.title.toLowerCase().includes("convidar") ||
          m.title.toLowerCase().includes("amigo");

        // Infer verificationType if not set
        let vType = m.verificationType;
        if (!vType) {
          if (isReferral) vType = "referral";
          else if (m.title.toLowerCase().includes("voucher") || m.title.toLowerCase().includes("benefício")) vType = "benefit_redeem";
          else if (m.title.toLowerCase().includes("founders") || m.title.toLowerCase().includes("pitch")) vType = "founders_pitch";
          else if (m.title.toLowerCase().includes("run") || m.title.toLowerCase().includes("corrida")) vType = "run_signup";
          else if (m.title.toLowerCase().includes("bank") || m.title.toLowerCase().includes("pix")) vType = "bank_pix";
          else if (m.title.toLowerCase().includes("circle") || m.title.toLowerCase().includes("unplug")) vType = "circle_connect";
          else vType = "manual";
        }

        // Automatic progress check for referrals
        let progress = userState?.progress || 0;
        let isCompleted = userState?.isCompleted || false;

        if (isReferral) {
          const refCount = passStore.countUserReferrals(user.id);
          progress = Math.max(progress, Math.min(m.total, refCount));
          if (progress >= m.total) {
            isCompleted = true;
          }
        }

        return {
          ...m,
          verificationType: vType,
          progress,
          isCompleted,
          isAccepted: userState ? userState.isAccepted : false,
          acceptedAt: userState?.acceptedAt,
          completedAt: userState?.completedAt,
        };
      });

      if (userVouchers.length === 0) {
        userVouchers = passStore.getUserVouchers(user.id);
        if (userVouchers.length === 0 && user.email) {
          userVouchers = passStore.getUserVouchers(user.email);
        }
      }
    }

    // Referral Info for current user
    let referralInfo = null;
    if (user) {
      const storeReferrer = passStore.getUserReferrer(user.id);
      let referredBy = storeReferrer
        ? { id: storeReferrer.referrerId, name: storeReferrer.referrerName }
        : null;
      let metaFriendsCount = 0;

      if (supabaseAdmin) {
        try {
          const { data: authData } = await supabaseAdmin.auth.admin.getUserById(user.id);
          const meta = authData?.user?.user_metadata;
          if (meta?.friends_invited_count) {
            metaFriendsCount = Number(meta.friends_invited_count) || 0;
          }
          if (!referredBy && meta?.referred_by_id) {
            referredBy = {
              id: meta.referred_by_id,
              name: meta.referred_by_name || "Membro PRX",
            };
          }
        } catch {}
      }

      const friendsCount = Math.max(passStore.countUserReferrals(user.id), metaFriendsCount);

      referralInfo = {
        userId: user.id,
        referralCode: user.id.slice(0, 8).toUpperCase(),
        friendsInvitedCount: friendsCount,
        referredBy,
      };
    }

    // Custo, receita por resgate e comissão são números internos da PRX: o membro só vê o preço em coins.
    const memberBenefits = benefits.map(forMember);

    return NextResponse.json({
      success: true,
      benefits: memberBenefits,
      missions,
      vouchers: userVouchers,
      referralInfo,
      currentUser: user
        ? {
            id: user.id,
            email: user.email,
            name: user.fullName,
            prxLevel: user.prxLevel,
            prxScore: user.prxScore,
            role: user.role,
            walletBalance: user.walletBalance,
          }
        : null,
    });
  } catch (error) {
    return incidentResponse(error, "Erro ao consultar dados do PRX Pass.");
  }
}
