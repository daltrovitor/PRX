import { NextRequest, NextResponse } from "next/server";
import { calculatePrxLevel } from "@/lib/pass-data";
import { getCurrentUser } from "@/lib/auth";
import { passStore } from "@/lib/pass-store";
import { supabaseAdmin } from "@/lib/supabase/client";
import type { ProfileRow } from "@/lib/db-rows";
import { incidentResponse } from "@/lib/incidents";


export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const shortCode = user.id.slice(0, 8).toUpperCase();
    const storeReferrals = passStore.getReferralsByUser(user.id);
    const storeReferrer = passStore.getUserReferrer(user.id);

    // Also check Supabase user_metadata for referredBy if available
    let referredBy = storeReferrer
      ? { id: storeReferrer.referrerId, name: storeReferrer.referrerName }
      : null;

    if (!referredBy && supabaseAdmin) {
      try {
        const { data: authData } = await supabaseAdmin.auth.admin.getUserById(user.id);
        const meta = authData?.user?.user_metadata;
        if (meta?.referred_by_id) {
          referredBy = {
            id: meta.referred_by_id,
            name: meta.referred_by_name || "Membro PRX",
          };
        }
      } catch {}
    }

    return NextResponse.json({
      success: true,
      referralInfo: {
        userId: user.id,
        referralCode: shortCode,
        friendsInvitedCount: storeReferrals.length,
        referredBy,
      },
      invitedFriends: storeReferrals.map((r) => ({
        id: r.id,
        friendName: r.referredUserName,
        createdAt: r.createdAt,
      })),
    });
  } catch (error) {
    return incidentResponse(error, "Erro ao carregar dados de indicação.");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: "Faça login para validar sua indicação." }, { status: 401 });
    }

    const body = await req.json();
    const rawReferrerId = body.referrerId?.trim();

    if (!rawReferrerId) {
      return NextResponse.json(
        { error: "Por favor, digite o ID ou código do amigo que te indicou." },
        { status: 400 }
      );
    }

    const cleanInput = rawReferrerId.toLowerCase();
    const userShort = user.id.slice(0, 8).toLowerCase();
    const userEmail = (user.email || "").toLowerCase();

    // 1. Anti-self referral check
    if (
      cleanInput === user.id.toLowerCase() ||
      cleanInput === userShort ||
      (userEmail && cleanInput === userEmail) ||
      user.id.replace(/-/g, "").toLowerCase().startsWith(cleanInput)
    ) {
      return NextResponse.json(
        { error: `Você não pode indicar a si mesmo (${userShort.toUpperCase()})! Insira o código ou e-mail de um amigo (ex: 2662CD6C).` },
        { status: 400 }
      );
    }

    // 2. Find Referrer Profile
    let referrerProfile: { id: string; name: string; score: number; level: number } | null = null;

    if (supabaseAdmin) {
      try {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawReferrerId);
        let prof: ProfileRow | null = null;

        if (isUuid) {
          // Exact UUID match
          const { data } = await supabaseAdmin
            .from("profiles")
            .select("id, full_name, nxt_score, nxt_level, email")
            .eq("id", rawReferrerId)
            .maybeSingle();
          prof = data;
        } else if (rawReferrerId.includes("@")) {
          // Email match
          const { data } = await supabaseAdmin
            .from("profiles")
            .select("id, full_name, nxt_score, nxt_level, email")
            .ilike("email", cleanInput)
            .maybeSingle();
          prof = data;
        } else {
          // Short referral code (8-char prefix) or partial UUID
          const { data: allProfs } = await supabaseAdmin
            .from("profiles")
            .select("id, full_name, nxt_score, nxt_level, email");

          if (allProfs) {
            prof = allProfs.find((p) => {
              const pId = p.id.toLowerCase();
              const pIdNoDashes = pId.replace(/-/g, "");
              const pEmail = (p.email || "").toLowerCase();
              return (
                pId.startsWith(cleanInput) ||
                pIdNoDashes.startsWith(cleanInput) ||
                pEmail === cleanInput
              );
            }) || null;
          }
        }

        if (prof) {
          referrerProfile = {
            id: prof.id,
            name: prof.full_name || "Membro PRX",
            score: prof.nxt_score || 250,
            level: prof.nxt_level || 1,
          };
        }
      } catch (err) {
        console.warn("Notice querying referrer profile in Supabase:", err);
      }
    }

    // Direct fallback for Vitor Daltro (2662CD6C)
    if (!referrerProfile && (cleanInput === "2662cd6c" || cleanInput === "2662cd6c-b521-4405-844f-47a0739268c6" || cleanInput === "vitor.daltrof@gmail.com")) {
      referrerProfile = {
        id: "2662cd6c-b521-4405-844f-47a0739268c6",
        name: "Vitor",
        score: 300,
        level: 1,
      };
    }

    // Fallback in-memory user store
    if (!referrerProfile) {
      const { userStore } = await import("@/lib/auth");
      const stored =
        userStore.findById(rawReferrerId) ||
        userStore.findByEmail(cleanInput) ||
        userStore.getAllUsers().find((u) => {
          const uId = u.id.toLowerCase();
          const uIdShort = uId.slice(0, 8);
          const uEmail = u.email.toLowerCase();
          return uId.startsWith(cleanInput) || uIdShort === cleanInput || uEmail === cleanInput;
        });

      if (stored) {
        referrerProfile = {
          id: stored.id,
          name: stored.fullName,
          score: stored.prxScore,
          level: stored.prxLevel,
        };
      }
    }

    if (!referrerProfile) {
      return NextResponse.json(
        {
          error:
            "Código de amigo não encontrado. Verifique se digitou o código de 8 caracteres (ex: 2662CD6C), ID ou e-mail correto.",
        },
        { status: 404 }
      );
    }

    // Prevent referring yourself even with prefix matching
    if (referrerProfile.id.toLowerCase() === user.id.toLowerCase()) {
      return NextResponse.json(
        { error: `Você não pode indicar a si mesmo (${referrerProfile.name})! Insira o código de outro amigo (ex: 2662CD6C).` },
        { status: 400 }
      );
    }

    // 3. Already referred check (allow switching if different referrer)
    let alreadyHadReferrer = false;
    const existingStoreReferral = passStore.getUserReferrer(user.id);
    if (existingStoreReferral) {
      if (existingStoreReferral.referrerId.toLowerCase() === referrerProfile.id.toLowerCase()) {
        return NextResponse.json(
          { error: `Você já utilizou o convite de indicação de ${existingStoreReferral.referrerName}!` },
          { status: 400 }
        );
      }
      alreadyHadReferrer = true;
    }

    if (supabaseAdmin) {
      try {
        const { data: authData } = await supabaseAdmin.auth.admin.getUserById(user.id);
        const prevId = authData?.user?.user_metadata?.referred_by_id;
        if (prevId) {
          if (prevId.toLowerCase() === referrerProfile.id.toLowerCase()) {
            const prevName = authData.user?.user_metadata?.referred_by_name || referrerProfile.name;
            return NextResponse.json(
              { error: `Você já utilizou o convite de indicação de ${prevName}!` },
              { status: 400 }
            );
          }
          alreadyHadReferrer = true;
        }
      } catch {}
    }

    // 4. Record Referral in passStore
    const refResult = passStore.recordReferral({
      referrerId: referrerProfile.id,
      referrerName: referrerProfile.name,
      referredUserId: user.id,
      referredUserName: user.fullName || "Novo Membro",
    });

    if (!refResult.success) {
      return NextResponse.json({ error: refResult.error }, { status: 400 });
    }

    // 5. Calculate & Update XP for Referrer (+250 XP base + mission reward if any)
    const baseReferralXp = 250;
    const missionXp = refResult.xpEarned || 0;
    const totalReferrerXpBonus = baseReferralXp + missionXp;
    const newReferrerScore = (referrerProfile.score || 250) + totalReferrerXpBonus;
    const newReferrerLevel = calculatePrxLevel(newReferrerScore);

    // 6. Calculate & Update XP for Invited Friend (+100 XP Welcome Bonus se novo)
    const friendWelcomeXp = alreadyHadReferrer ? 0 : 100;
    const currentFriendScore = user.prxScore || 250;
    const newFriendScore = currentFriendScore + friendWelcomeXp;
    const newFriendLevel = calculatePrxLevel(newFriendScore);

    // Update in Supabase for both parties
    if (supabaseAdmin) {
      try {
        // Update Friend (current user)
        await supabaseAdmin
          .from("profiles")
          .update({
            nxt_score: newFriendScore,
            nxt_level: newFriendLevel,
          })
          .eq("id", user.id);

        const { data: userAuth } = await supabaseAdmin.auth.admin.getUserById(user.id);
        const userMeta = userAuth?.user?.user_metadata || {};

        await supabaseAdmin.auth.admin.updateUserById(user.id, {
          user_metadata: {
            ...userMeta,
            nxt_score: newFriendScore,
            nxt_level: newFriendLevel,
            referred_by_id: referrerProfile.id,
            referred_by_name: referrerProfile.name,
            referred_at: new Date().toISOString(),
          },
        });

        // Update Referrer
        await supabaseAdmin
          .from("profiles")
          .update({
            nxt_score: newReferrerScore,
            nxt_level: newReferrerLevel,
          })
          .eq("id", referrerProfile.id);

        const { data: refAuth } = await supabaseAdmin.auth.admin.getUserById(referrerProfile.id);
        const refMeta = refAuth?.user?.user_metadata || {};
        const friendsCount = (refMeta.friends_invited_count || 0) + 1;

        await supabaseAdmin.auth.admin.updateUserById(referrerProfile.id, {
          user_metadata: {
            ...refMeta,
            nxt_score: newReferrerScore,
            nxt_level: newReferrerLevel,
            friends_invited_count: friendsCount,
          },
        });
      } catch (dbErr) {
        console.warn("Notice updating scores in Supabase:", dbErr);
      }
    }

    // Also update in-memory userStore
    try {
      const { userStore } = await import("@/lib/auth");
      userStore.updateUser(user.id, {
        prxScore: newFriendScore,
        prxLevel: newFriendLevel,
      });
      userStore.updateUser(referrerProfile.id, {
        prxScore: newReferrerScore,
        prxLevel: newReferrerLevel,
      });
    } catch {}

    return NextResponse.json({
      success: true,
      message: `Indicação aceita! Você ganhou +${friendWelcomeXp} XP e seu amigo ${referrerProfile.name} recebeu +${totalReferrerXpBonus} XP!`,
      referrer: {
        id: referrerProfile.id,
        name: referrerProfile.name,
      },
      bonusXp: friendWelcomeXp,
      referrerXpAwarded: totalReferrerXpBonus,
      currentUser: {
        id: user.id,
        name: user.fullName,
        prxScore: newFriendScore,
        prxLevel: newFriendLevel,
      },
    });
  } catch (error) {
    return incidentResponse(error, "Erro ao processar código de indicação.");
  }
}
