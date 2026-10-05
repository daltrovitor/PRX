// Hello World
"use client";

import { useState } from "react";
import { Button, Notice } from "@/components/app/ui";
import { BankKycPanel } from "@/components/app/bank/bank-kyc";
import { ProviderOnboarding } from "@/components/app/bank/provider-onboarding";
import type { BankAccountView } from "@/lib/prx/bank";
import type { User } from "@/hooks/use-auth";

const FRESH_KYC = { status: "none", reviewNote: "", awaitingGuardian: false, awaitingEmancipation: false } as const;

/**
 * Conta em ativação. Com a conta já aberta, mostra os documentos e a resposta da
 * aprovação. Sem conta aberta (inclusive as criadas antes da produção), sempre dá
 * o caminho: "Ativar minha conta" leva ao envio dos dados e documentos, e a
 * resposta (aprovada, em análise ou recusada) volta para esta tela.
 */
export function ActivationPanel({ account, member, onChanged }: { account: BankAccountView; member: User; onChanged: () => Promise<void> | void }) {
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const provider = account.provider;
  const opened = provider && (provider.state === "pending_activation" || provider.state === "rejected" || provider.state === "provisioning");

  if (opened) return <ProviderOnboarding provider={provider} onChanged={() => void onChanged()} />;

  if (sending) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" className="min-h-12" onClick={() => setSending(false)}>
          Voltar
        </Button>
        <BankKycPanel
          member={member}
          kyc={FRESH_KYC}
          onDone={async (providerError) => {
            setNotice(providerError ?? null);
            setSending(false);
            await onChanged();
          }}
        />
      </div>
    );
  }

  return (
    <section className="glass space-y-4 rounded-3xl p-5 sm:p-6">
      <h2 className="text-xl font-semibold tracking-[-0.02em] text-ink">Ative sua conta PRX BANK</h2>
      <p className="text-[15px] leading-relaxed text-muted-foreground">
        Envie seus dados e a frente e o verso do RG ou da CNH. Conferimos tudo e você recebe aqui a resposta: conta aprovada ou o que precisa ser reenviado. Em geral, em até 2
        dias úteis.
      </p>
      {notice && <Notice tone="warning">{notice}</Notice>}
      <Button className="min-h-12" onClick={() => setSending(true)}>
        Ativar minha conta
      </Button>
    </section>
  );
}
