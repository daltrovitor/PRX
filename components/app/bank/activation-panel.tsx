// Hello World
"use client";

import { ProviderOnboarding } from "@/components/app/bank/provider-onboarding";
import type { BankAccountView } from "@/lib/prx/bank";

/**
 * Conta em ativação: abertura no banco parceiro (documentos e aprovação) ou, se
 * a ligação com o banco parceiro ainda não está no ar, o aviso de que a conta é
 * ativada assim que estiver.
 */
export function ActivationPanel({ account, onChanged }: { account: BankAccountView; onChanged: () => Promise<void> | void }) {
  const provider = account.provider;
  if (provider) return <ProviderOnboarding provider={provider} onChanged={() => void onChanged()} />;
  return (
    <section className="glass space-y-3 rounded-3xl p-5 sm:p-6">
      <h2 className="text-xl font-semibold tracking-[-0.02em] text-ink">Conta em ativação</h2>
      <p className="text-[15px] leading-relaxed text-muted-foreground">
        Sua conta PRX BANK é aberta com o nosso banco parceiro, que confere seus dados e documentos e aprova a conta. Estamos concluindo essa ligação: assim que estiver no
        ar, você abre a conta por aqui e recebe o aviso da aprovação.
      </p>
    </section>
  );
}
