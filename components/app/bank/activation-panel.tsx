// Hello World
"use client";

import { useState } from "react";
import { Button } from "@/components/app/ui";
import { BankKycPanel } from "@/components/app/bank/bank-kyc";
import { ProviderOnboarding } from "@/components/app/bank/provider-onboarding";
import type { BankAccountView } from "@/lib/prx/bank";
import type { BankKycState } from "@/lib/kyc/types";
import type { User } from "@/hooks/use-auth";

const FRESH_KYC: BankKycState = { status: "none", reviewNote: "", awaitingGuardian: false, awaitingEmancipation: false, submittedAt: null, documents: [], resubmissionRequested: false, ageBlocked: false };

const dateBR = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : null);

/**
 * Conta em ativação. A etapa vem do servidor (account.activation), com o que
 * está salvo: quem já enviou os dados vê a situação deles e nunca volta ao
 * formulário vazio. Refazer o envio só por escolha ("Corrigir meus dados") e só
 * enquanto a conta ainda não existe no banco parceiro.
 */
export function ActivationPanel({ account, member, onChanged }: { account: BankAccountView; member: User; onChanged: () => Promise<void> | void }) {
  const [redoing, setRedoing] = useState(false);
  const { activation, provider } = account;

  if (redoing) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" className="min-h-12" onClick={() => setRedoing(false)}>
          Voltar
        </Button>
        <BankKycPanel
          member={member}
          kyc={FRESH_KYC}
          onDone={async () => {
            setRedoing(false);
            await onChanged();
          }}
        />
      </div>
    );
  }

  if (activation === "unavailable") {
    const sent = dateBR(account.kyc.submittedAt);
    return (
      <section aria-labelledby="activation-title" className="glass space-y-4 rounded-3xl p-5 sm:p-6">
        <h2 id="activation-title" className="text-xl font-semibold tracking-[-0.02em] text-ink">
          Conta em análise
        </h2>
        <p className="text-[15px] leading-relaxed text-muted-foreground">
          Seus dados e documentos{sent ? `, enviados em ${sent},` : ""} estão salvos. A abertura da conta no PRX BANK ainda não foi concluída, e você não precisa enviar
          nada de novo: avisamos aqui assim que a conta estiver pronta.
        </p>
        <Button variant="secondary" className="min-h-12" onClick={() => void onChanged()}>
          Verificar de novo
        </Button>
      </section>
    );
  }

  if (provider && (activation === "ready" || activation === "opening" || activation === "review" || activation === "rejected")) {
    const sent = dateBR(account.kyc.submittedAt);
    return (
      <div className="space-y-3">
        <ProviderOnboarding provider={provider} onChanged={() => void onChanged()} />
        {activation === "ready" && (
          <div className="space-y-2 px-1">
            {sent && <p className="text-[13px] leading-relaxed text-muted-foreground">A conta é aberta com os dados enviados em {sent}.</p>}
            <Button variant="ghost" className="min-h-12" onClick={() => setRedoing(true)}>
              Corrigir meus dados
            </Button>
          </div>
        )}
      </div>
    );
  }

  return null;
}
