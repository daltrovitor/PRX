// Hello World

/** Founder da PRX (tipos e regra de vigência, sem acesso ao banco: servem também às telas). */

export interface FounderMember {
  id: string;
  userId: string;
  displayName: string;
  headline: string;
  bio: string;
  benefits: string[];
  eligibility: string;
  status: "active" | "inactive";
  showPublicly: boolean;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Founder vale agora: ativo e dentro da vigência. */
export function founderIsCurrent(f: Pick<FounderMember, "status" | "startsAt" | "endsAt">, now = new Date()): boolean {
  if (f.status !== "active") return false;
  if (f.startsAt && Date.parse(f.startsAt) > now.getTime()) return false;
  if (f.endsAt && Date.parse(f.endsAt) <= now.getTime()) return false;
  return true;
}
