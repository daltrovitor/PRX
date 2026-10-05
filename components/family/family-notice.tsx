// Hello World
import type { ReactNode } from "react";
import { Notice } from "@/components/app/ui";
import { APP_HOST } from "@/lib/domains";
import type { FamilyState } from "@/lib/family/service";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Aviso do app para contas de menor: aguardando responsável, emancipação em análise ou limites ativos. */
export function familyNotice(state: FamilyState | null): ReactNode {
  const identity = state?.identity;
  if (!state || !identity || identity.accountType !== "minor") return null;
  if (identity.status === "link_pending") {
    return (
      <Notice tone="warning">
        Sua Conta Filho está esperando {state.link?.parentEmail ? <strong className="font-semibold">{state.link.parentEmail}</strong> : "o seu responsável"} aceitar na Conta Pai. Até lá, Pix e cartão ficam
        travados; benefícios, eventos e missões já funcionam.
      </Notice>
    );
  }
  if (identity.status === "emancipation_pending") {
    return <Notice>Seus documentos de emancipação estão em análise (até 2 dias úteis). Pix e cartão liberam assim que a equipe PRX aprovar.</Notice>;
  }
  if (identity.status === "rejected") {
    return (
      <Notice tone="warning">
        {state.emancipation?.status === "rejected"
          ? `A emancipação não foi aprovada${state.emancipation.reviewNote ? `: ${state.emancipation.reviewNote}` : "."} Fale com o suporte ou peça ao seu responsável para abrir a Conta Pai.`
          : `O vínculo com o responsável não foi aceito. Peça para ele abrir a Conta Pai em ${APP_HOST}/sou-pai e aceitar o pedido.`}
      </Notice>
    );
  }
  if (state.limits) {
    return (
      <Notice>
        Conta acompanhada pelo seu responsável · limite de {brl(state.limits.perTransaction)} por compra, {brl(state.limits.daily)} por dia e {brl(state.limits.monthly)} por mês.
      </Notice>
    );
  }
  return null;
}
