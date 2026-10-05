// Hello World
"use client";

import { useState } from "react";
import { Button } from "@/components/app/ui";
import { BankKycPanel } from "@/components/app/bank/bank-kyc";
import { ProviderOnboarding } from "@/components/app/bank/provider-onboarding";
import type { BankAccountView } from "@/lib/prx/bank";
import type { User } from "@/hooks/use-auth";

const FRESH_KYC = { status: "none", reviewNote: "", awaitingGuardian: false, awaitingEmancipation: false } as const;

/**
 * Conta em ativação: mostra a abertura no banco parceiro (documentos e
 * aprovação do Asaas) e, enquanto a conta ainda não foi criada lá, deixa o
 * membro trocar os dados e documentos (por exemplo, fotos de teste).
 */
export function ActivationPanel({ account, member, onChanged }: { account: BankAccountView; member: User; onChanged: () => Promise<void> | void }) {
  const [redo, setRedo] = useState(false);
  const provider = account.provider;

  if (redo) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" className="min-h-12" onClick={() => setRedo(false)}>
          Voltar
        </Button>
        <BankKycPanel
          member={member}
          kyc={FRESH_KYC}
          onDone={async () => {
            setRedo(false);
            await onChanged();
          }}
        />
      </div>
    );
  }

  const canRedo = !provider || provider.state === "none";
  return (
    <div className="space-y-4">
      {provider ? (
        <ProviderOnboarding provider={provider} onChanged={() => void onChanged()} />
      ) : (
        <section className="glass space-y-3 rounded-3xl p-5 sm:p-6">
          <h2 className="text-xl font-semibold tracking-[-0.02em] text-ink">Conta em ativação</h2>
          <p className="text-[15px] leading-relaxed text-muted-foreground">
            Sua conta PRX BANK é aberta no banco parceiro (Asaas), que confere seus dados e documentos e aprova a conta. Estamos concluindo a ligação do PRX com o banco
            parceiro: assim que estiver no ar, você abre a conta por aqui e recebe o aviso da aprovação.
          </p>
        </section>
      )}
      {canRedo && (
        <section className="space-y-3 rounded-3xl border border-line p-5 sm:p-6">
          <p className="text-[15px] text-ink">Os documentos que você enviou eram de teste?</p>
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            O banco parceiro recusa fotos que não sejam do seu documento. Antes de abrir a conta, envie de novo seus dados e a frente e o verso do RG ou da CNH.
          </p>
          <Button variant="secondary" className="min-h-12" onClick={() => setRedo(true)}>
            Enviar dados e documentos reais
          </Button>
        </section>
      )}
    </div>
  );
}
