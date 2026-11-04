import {
  Benefit,
  UserVoucher,
  PassMission,
  ReferralRecord,
} from "./pass-data";

export type { Benefit };

export interface SystemVoucher extends UserVoucher {
  userEmail: string;
  userName: string;
  userId: string;
  /** Datas ISO para métricas; redeemedAt é só o texto de exibição. */
  createdAtIso?: string;
  validatedAtIso?: string | null;
  validatedBy?: string | null;
}

export interface UserMissionState {
  isAccepted: boolean;
  progress: number;
  isCompleted: boolean;
  acceptedAt?: string;
  completedAt?: string;
}

/**
 * Id único mesmo quando vários registros nascem no mesmo milissegundo
 * (ex.: as missões-modelo criadas em laço), o que antes gerava ids repetidos.
 */
function uniqueId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
}

class PassStore {
  private benefits: Benefit[] = [];
  private missions: PassMission[] = [];
  private vouchers: SystemVoucher[] = [];
  // userId -> { missionId -> UserMissionState }
  private userMissions: Record<string, Record<string, UserMissionState>> = {};
  // Referral history: [{ id, referrerId, referrerName, referredUserId, referredUserName, createdAt }]
  private referrals: ReferralRecord[] = [];

  constructor() {
    this.resetToDefaults();
    this.purgeIronBox();
  }

  purgeIronBox() {
    this.benefits = this.benefits.filter(
      (b) =>
        !b.partnerName?.toLowerCase().includes("ironbox") &&
        !b.title?.toLowerCase().includes("ironbox")
    );
  }

  resetToDefaults() {
    this.benefits = [];
    this.missions = [];
    this.vouchers = [];
    this.userMissions = {};
    this.referrals = [];
  }

  // --- BENEFITS CRUD ---
  getBenefits(): Benefit[] {
    return this.benefits;
  }

  setBenefits(benefits: Benefit[]) {
    this.benefits = [...benefits];
  }

  clearBenefits() {
    this.benefits = [];
  }

  getBenefitById(id: string): Benefit | undefined {
    return this.benefits.find((b) => b.id === id);
  }

  createBenefit(data: Omit<Benefit, "id"> & { id?: string }): Benefit {
    const newId = data.id || uniqueId("ben");
    const newBenefit: Benefit = {
      ...data,
      id: newId,
    };
    const existingIdx = this.benefits.findIndex((b) => b.id === newId);
    if (existingIdx !== -1) {
      this.benefits[existingIdx] = { ...this.benefits[existingIdx], ...newBenefit };
      return this.benefits[existingIdx];
    }
    this.benefits.unshift(newBenefit);
    return newBenefit;
  }

  updateBenefit(id: string, updates: Partial<Benefit>): Benefit | null {
    const idx = this.benefits.findIndex((b) => b.id === id);
    if (idx === -1) return null;
    this.benefits[idx] = { ...this.benefits[idx], ...updates, id };
    return this.benefits[idx];
  }

  deleteBenefit(id: string): boolean {
    const initialLen = this.benefits.length;
    this.benefits = this.benefits.filter((b) => b.id !== id);
    return this.benefits.length < initialLen;
  }

  // --- MISSIONS CRUD ---
  getMissions(): PassMission[] {
    return this.missions;
  }

  getMissionById(id: string): PassMission | undefined {
    return this.missions.find((m) => m.id === id);
  }

  createMission(data: Omit<PassMission, "id"> & { id?: string }): PassMission {
    const newId = data.id || uniqueId("miss");
    const newMission: PassMission = {
      ...data,
      id: newId,
    };
    this.missions.push(newMission);
    return newMission;
  }

  updateMission(id: string, updates: Partial<PassMission>): PassMission | null {
    const idx = this.missions.findIndex((m) => m.id === id);
    if (idx === -1) return null;
    this.missions[idx] = { ...this.missions[idx], ...updates, id };
    return this.missions[idx];
  }

  deleteMission(id: string): boolean {
    const initialLen = this.missions.length;
    this.missions = this.missions.filter((m) => m.id !== id);
    return this.missions.length < initialLen;
  }

  // --- USER MISSIONS & PROGRESS ---
  getUserMissions(userId: string): PassMission[] {
    if (!this.userMissions) this.userMissions = {};
    if (!this.missions) this.missions = [];
    const userState = this.userMissions[userId] || {};
    return this.missions.map((m) => {
      const state = userState[m.id];
      if (state) {
        return {
          ...m,
          progress: state.progress,
          isCompleted: state.isCompleted,
          isAccepted: state.isAccepted,
          acceptedAt: state.acceptedAt,
          completedAt: state.completedAt,
        };
      }
      return {
        ...m,
        progress: 0,
        isCompleted: false,
        isAccepted: false,
      };
    });
  }

  acceptMission(userId: string, missionId: string): { success: boolean; mission?: PassMission; error?: string } {
    const mission = this.getMissionById(missionId);
    if (!mission) {
      return { success: false, error: "Missão não encontrada." };
    }

    if (!this.userMissions[userId]) {
      this.userMissions[userId] = {};
    }

    const current = this.userMissions[userId][missionId];
    if (current && current.isAccepted) {
      return {
        success: true,
        mission: {
          ...mission,
          progress: current.progress,
          isCompleted: current.isCompleted,
          isAccepted: true,
          acceptedAt: current.acceptedAt,
        },
      };
    }

    // Check if user already has partial progress (e.g. from referrals)
    let initialProgress = 0;
    if (mission.verificationType === "referral") {
      initialProgress = this.countUserReferrals(userId);
    }

    const newState: UserMissionState = {
      isAccepted: true,
      progress: Math.min(mission.total, initialProgress),
      isCompleted: initialProgress >= mission.total,
      acceptedAt: new Date().toISOString(),
      completedAt: initialProgress >= mission.total ? new Date().toISOString() : undefined,
    };

    this.userMissions[userId][missionId] = newState;

    return {
      success: true,
      mission: {
        ...mission,
        ...newState,
      },
    };
  }

  verifyMission(
    userId: string,
    missionId: string,
    extra?: { userVouchersCount?: number; liveCheckins?: number; runSignups?: number; foundersSubmissions?: number }
  ): {
    success: boolean;
    completed: boolean;
    progress: number;
    total: number;
    xpEarned: number;
    message: string;
  } {
    const mission = this.getMissionById(missionId);
    if (!mission) {
      return {
        success: false,
        completed: false,
        progress: 0,
        total: 1,
        xpEarned: 0,
        message: "Missão não encontrada.",
      };
    }

    if (!this.userMissions[userId]) {
      this.userMissions[userId] = {};
    }

    let state = this.userMissions[userId][missionId];
    if (!state) {
      state = {
        isAccepted: true,
        progress: 0,
        isCompleted: false,
        acceptedAt: new Date().toISOString(),
      };
      this.userMissions[userId][missionId] = state;
    }

    if (state.isCompleted) {
      return {
        success: true,
        completed: true,
        progress: mission.total,
        total: mission.total,
        xpEarned: 0,
        message: "Esta missão já foi concluída anteriormente!",
      };
    }

    const vType = mission.verificationType || "manual";
    let newProgress = state.progress;
    let completed = false;
    let message = "";

    if (vType === "referral") {
      const friendsCount = this.countUserReferrals(userId);
      newProgress = Math.min(mission.total, friendsCount);
      if (newProgress >= mission.total) {
        completed = true;
        message = `Missão resolvida! ${friendsCount} amigo(s) indicado(s) com sucesso. Recompensa de +${mission.xpReward} XP liberada!`;
      } else {
        return {
          success: false,
          completed: false,
          progress: newProgress,
          total: mission.total,
          xpEarned: 0,
          message: `Você indicou ${friendsCount} de ${mission.total} amigo(s). Compartilhe seu código de membro para completar a missão!`,
        };
      }
    } else if (vType === "benefit_redeem") {
      const vouchersCount = extra?.userVouchersCount ?? this.getUserVouchers(userId).length;
      newProgress = Math.min(mission.total, vouchersCount);
      if (newProgress >= mission.total) {
        completed = true;
        message = `Missão resolvida! Você resgatou vantagens no marketplace PRX PASS. Recompensa de +${mission.xpReward} XP liberada!`;
      } else {
        return {
          success: false,
          completed: false,
          progress: newProgress,
          total: mission.total,
          xpEarned: 0,
          message: `Você ainda não possui vouchers ativos suficientes (${newProgress}/${mission.total}). Resgate benefícios no catálogo para validar!`,
        };
      }
    } else if (vType === "founders_pitch") {
      const sent = extra?.foundersSubmissions ?? 0;
      if (sent < 1) {
        return { success: false, completed: false, progress: 0, total: mission.total, xpEarned: 0, message: "Envie sua startup no PRX FOUNDERS (aba LIVE) para concluir esta missão." };
      }
      newProgress = mission.total;
      completed = true;
      message = `Pitch submetido com sucesso no funil Zero to One de Rafael Molina! Recompensa de +${mission.xpReward} XP desbloqueada.`;
    } else if (vType === "run_signup") {
      const signups = extra?.runSignups ?? 0;
      if (signups < 1) {
        return { success: false, completed: false, progress: 0, total: mission.total, xpEarned: 0, message: "Faça sua inscrição confirmada em uma etapa da PRX RUN (aba LIVE) para concluir esta missão." };
      }
      newProgress = mission.total;
      completed = true;
      message = `Inscrição confirmada no circuito PRX RUN! Kit atleta reservado. Recompensa de +${mission.xpReward} XP desbloqueada.`;
    } else if (vType === "bank_pix") {
      newProgress = mission.total;
      completed = true;
      message = `Chave Pix ativada e hábito inteligente validado (Build. Don't Bet)! Recompensa de +${mission.xpReward} XP desbloqueada.`;
    } else if (vType === "circle_connect") {
      newProgress = mission.total;
      completed = true;
      message = `Frase de propósito registrada no PRX CIRCLE Unplug! Conexão real estabelecida. Recompensa de +${mission.xpReward} XP desbloqueada.`;
    } else if (vType === "mentor_session") {
      newProgress = mission.total;
      completed = true;
      message = `Mentoria de Ambição com Rafael Molina agendada com sucesso! Recompensa de +${mission.xpReward} XP desbloqueada.`;
    } else if (vType === "mindspace_care") {
      newProgress = mission.total;
      completed = true;
      message = `Check-in de saúde emocional registrado no PRÓXIMO EU! Recompensa de +${mission.xpReward} XP desbloqueada.`;
    } else if (vType === "event_checkin") {
      const checkins = extra?.liveCheckins ?? 0;
      newProgress = Math.min(mission.total, checkins);
      if (checkins < mission.total) {
        return {
          success: false,
          completed: false,
          progress: newProgress,
          total: mission.total,
          xpEarned: 0,
          message: `Seu ingresso precisa ser validado na portaria de um evento PRX LIVE (${newProgress}/${mission.total}).`,
        };
      }
      completed = true;
      message = `Check-in presencial no evento PRX LIVE validado com sucesso! Recompensa de +${mission.xpReward} XP desbloqueada.`;
    } else {
      // manual
      newProgress = mission.total;
      completed = true;
      message = `Desafio concluído com sucesso! Recompensa de +${mission.xpReward} XP desbloqueada no seu Passe.`;
    }

    state.progress = newProgress;
    state.isCompleted = completed;
    if (completed) {
      state.completedAt = new Date().toISOString();
    }

    return {
      success: true,
      completed,
      progress: newProgress,
      total: mission.total,
      xpEarned: completed ? mission.xpReward : 0,
      message,
    };
  }

  // --- REFERRAL (MEMBER GET MEMBER) ---
  countUserReferrals(userId: string): number {
    if (!this.referrals) this.referrals = [];
    const cleanId = userId.toLowerCase();
    const shortCode = userId.slice(0, 8).toUpperCase();
    return this.referrals.filter(
      (r) =>
        r.referrerId.toLowerCase() === cleanId ||
        r.referrerId.toUpperCase() === shortCode
    ).length;
  }

  getReferralsByUser(userId: string): ReferralRecord[] {
    const cleanId = userId.toLowerCase();
    const shortCode = userId.slice(0, 8).toUpperCase();
    return this.referrals.filter(
      (r) =>
        r.referrerId.toLowerCase() === cleanId ||
        r.referrerId.toUpperCase() === shortCode
    );
  }

  getUserReferrer(userId: string): ReferralRecord | undefined {
    return this.referrals.find((r) => r.referredUserId === userId);
  }

  recordReferral(params: {
    referrerId: string;
    referrerName: string;
    referredUserId: string;
    referredUserName: string;
  }): {
    success: boolean;
    error?: string;
    referral?: ReferralRecord;
    completedMissions: PassMission[];
    xpEarned: number;
  } {
    const { referrerId, referrerName, referredUserId, referredUserName } = params;

    // Validation
    if (referrerId.toLowerCase() === referredUserId.toLowerCase()) {
      return {
        success: false,
        error: "Você não pode usar o seu próprio ID de indicação!",
        completedMissions: [],
        xpEarned: 0,
      };
    }

    const alreadyReferred = this.referrals.find((r) => r.referredUserId === referredUserId);
    if (alreadyReferred) {
      if (alreadyReferred.referrerId.toLowerCase() === referrerId.toLowerCase()) {
        return {
          success: false,
          error: `Você já foi indicado anteriormente por ${alreadyReferred.referrerName}!`,
          completedMissions: [],
          xpEarned: 0,
        };
      }
      // Se for um novo código/amigo, atualiza o vínculo removendo o anterior
      this.referrals = this.referrals.filter((r) => r.referredUserId !== referredUserId);
    }

    const newReferral: ReferralRecord = {
      id: uniqueId("ref"),
      referrerId,
      referrerName: referrerName || "Membro PRX",
      referredUserId,
      referredUserName: referredUserName || "Novo Membro",
      createdAt: new Date().toISOString(),
    };

    this.referrals.unshift(newReferral);

    // Update referrer's referral missions
    const completedMissions: PassMission[] = [];
    let totalXpEarned = 0;

    const currentFriendsCount = this.countUserReferrals(referrerId);

    // Look for referral missions in referrer's list
    this.missions.forEach((m) => {
      const isRef =
        m.verificationType === "referral" ||
        m.title.toLowerCase().includes("convidar") ||
        m.title.toLowerCase().includes("amigo");

      if (isRef) {
        if (!this.userMissions[referrerId]) {
          this.userMissions[referrerId] = {};
        }

        let state = this.userMissions[referrerId][m.id];
        if (!state) {
          state = {
            isAccepted: true,
            progress: 0,
            isCompleted: false,
            acceptedAt: new Date().toISOString(),
          };
          this.userMissions[referrerId][m.id] = state;
        }

        state.progress = Math.min(m.total, currentFriendsCount);
        if (state.progress >= m.total && !state.isCompleted) {
          state.isCompleted = true;
          state.completedAt = new Date().toISOString();
          completedMissions.push(m);
          totalXpEarned += m.xpReward;
        }
      }
    });

    return {
      success: true,
      referral: newReferral,
      completedMissions,
      xpEarned: totalXpEarned,
    };
  }

  // --- VOUCHERS OPERATIONS ---
  getVouchers(): SystemVoucher[] {
    return this.vouchers;
  }

  getUserVouchers(userIdOrEmail: string): SystemVoucher[] {
    const lower = userIdOrEmail.toLowerCase();
    return this.vouchers.filter(
      (v) => v.userId === userIdOrEmail || v.userEmail.toLowerCase() === lower
    );
  }

  createVoucher(voucher: Omit<SystemVoucher, "id"> & { id?: string }): SystemVoucher {
    const newId = voucher.id || uniqueId("vouch");
    const newVoucher: SystemVoucher = {
      ...voucher,
      createdAtIso: voucher.createdAtIso ?? new Date().toISOString(),
      id: newId,
    };
    // Purge any existing item with same id or code to avoid stale duplicate states
    this.vouchers = this.vouchers.filter(
      (v) =>
        (!voucher.id || v.id !== voucher.id) &&
        (!voucher.code || v.code?.toUpperCase() !== voucher.code?.toUpperCase())
    );
    this.vouchers.unshift(newVoucher);
    return newVoucher;
  }

  updateVoucherStatus(idOrCode: string, status: "valid" | "used", validatedBy?: string): SystemVoucher | null {
    const target = idOrCode.toUpperCase();
    let updated: SystemVoucher | null = null;
    this.vouchers.forEach((v) => {
      if (v.id === idOrCode || v.code?.toUpperCase() === target) {
        v.status = status;
        v.validatedAtIso = status === "used" ? new Date().toISOString() : null;
        v.validatedBy = status === "used" ? validatedBy ?? v.validatedBy ?? null : null;
        updated = v;
      }
    });
    return updated;
  }

  deleteVoucher(id: string): boolean {
    const initialLen = this.vouchers.length;
    this.vouchers = this.vouchers.filter((v) => v.id !== id);
    return this.vouchers.length < initialLen;
  }

  ensureCollections() {
    if (!this.benefits) this.benefits = [];
    if (!this.missions) this.missions = [];
    if (!this.vouchers) this.vouchers = [];
    if (!this.userMissions) this.userMissions = {};
    if (!this.referrals) this.referrals = [];

    // Deduplicate any stale voucher copies in memory
    const seen = new Set<string>();
    this.vouchers = this.vouchers.filter((v) => {
      const key = v.code?.toUpperCase() || v.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Purge test/junk dummy benefits from in-memory cache
    this.benefits = this.benefits.filter(
      (b) =>
        b.title !== "asdasd" &&
        b.partnerName !== "asdasd" &&
        b.title !== "Desconto Invalido" &&
        b.title !== "Desconto Teste" &&
        !b.title?.toLowerCase().includes("ironbox") &&
        !b.partnerName?.toLowerCase().includes("ironbox")
    );
  }
}

// Attach to globalThis to preserve state across Fast Refresh & Hot Reload in Dev
const globalStore = (globalThis as unknown as { __prxPassStore?: PassStore });

let storeInstance = globalStore.__prxPassStore;
if (!storeInstance) {
  storeInstance = new PassStore();
} else {
  // Update prototype in dev so newly added methods are immediately available
  Object.setPrototypeOf(storeInstance, PassStore.prototype);
  storeInstance.ensureCollections();
}

export const passStore = storeInstance;

if (process.env.NODE_ENV !== "production") {
  globalStore.__prxPassStore = passStore;
}
