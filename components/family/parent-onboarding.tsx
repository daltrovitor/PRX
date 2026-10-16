// Hello World
"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { useAuth } from "@/hooks/use-auth";
import { Button, Checkbox, Field, Input, Notice, ProgressBar, RadioCards, Select } from "@/components/app/ui";
import { DocumentPicker } from "@/components/family/document-picker";
import { postJson, useFamilyState } from "@/components/family/family-client";
import { maskCpfInput } from "@/lib/cpf-mask";
import { PasswordChecklist } from "@/components/auth/password-checklist";
import { PASSWORD_HINT, PASSWORD_MISMATCH } from "@/lib/password-policy";
import {
  GUARDIANSHIPS,
  GUARDIANSHIP_LABEL,
  INCOME_LABEL,
  INCOME_RANGES,
  missingParentDocuments,
  parentApplicationSchema,
  parentSignupSchema,
  type DocumentKind,
  type DocumentRef,
  type Guardianship,
  type IncomeRange,
} from "@/lib/family/types";

type Step = "intro" | "dados" | "renda" | "filho" | "documentos" | "enviado";
const FLOW: Step[] = ["dados", "renda", "filho", "documentos"];
const STEP_TITLE: Record<Exclude<Step, "intro" | "enviado">, { title: string; body: string }> = {
  dados: { title: "Seus dados", body: "Quem é o responsável. O CPF abre uma única conta na PRX." },
  renda: { title: "Profissão e renda", body: "Usamos para a análise de segurança exigida para contas de menores." },
  filho: { title: "Seu filho", body: "Depois da aprovação, você cria o acesso dele ou aceita o pedido que ele enviar." },
  documentos: { title: "Documentos", body: "RG e CPF (ou só a CNH) e a certidão de nascimento do seu filho — ou o termo de guarda/tutela." },
};

const maskPhone = (raw: string) => {
  const d = raw.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(-4)}`;
};

const PROMISES: ReadonlyArray<{ title: string; body: string }> = [
  { title: "Pix e mesada automática", body: "Envie quando quiser ou programe a mesada semanal ou mensal. Cai direto na conta do seu filho." },
  { title: "Limites do cartão", body: "Defina quanto ele pode gastar por compra, por dia e por mês. A PRX bloqueia o que passar." },
  { title: "Acompanhe tudo", body: "Saldo, extrato, benefícios resgatados, nível, XP, PRX Coins, eventos, ingressos e projetos." },
];

/**
 * "Sou Pai": abertura da Conta Pai em passos, no espírito da área de pais da
 * Revolut. A conta nasce em análise; controle, Pix e mesada liberam depois
 * que a equipe PRX confere os documentos.
 */
export function ParentOnboarding() {
  const { user, loading, refreshUser } = useAuth();
  const router = useRouter();
  const { state, reload } = useFamilyState(user?.id ?? null);
  const [step, setStep] = useState<Step>("intro");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [dados, setDados] = useState({ fullName: "", email: "", password: "", cpf: "", birthDate: "", phone: "", termsAccepted: false });
  const [confirmPassword, setConfirmPassword] = useState("");
  const [renda, setRenda] = useState<{ profession: string; incomeRange: IncomeRange | "" }>({ profession: "", incomeRange: "" });
  const [filho, setFilho] = useState({ childName: "", childBirthDate: "" });
  const [tutela, setTutela] = useState<{ relationship: Guardianship | ""; guardianshipDeclared: boolean }>({ relationship: "", guardianshipDeclared: false });
  const [docs, setDocs] = useState<Partial<Record<DocumentKind, DocumentRef>>>({});

  // Retoma de onde parou: Conta Pai criada e sem pedido enviado vai direto para a profissão.
  const parentState = user && state?.identity?.accountType === "parent" ? state : null;
  const resumeAt: Step | null = parentState ? (parentState.application && parentState.application.status !== "rejected" ? "enviado" : "renda") : null;
  useEffect(() => {
    if (!resumeAt) return;
    const id = window.setTimeout(() => setStep((current) => (current === "intro" || current === "dados" ? resumeAt : current)), 0);
    return () => window.clearTimeout(id);
  }, [resumeAt]);

  const memberLoggedIn = Boolean(user && state && state.identity?.accountType !== "parent");
  const flowIndex = FLOW.indexOf(step as (typeof FLOW)[number]);

  function go(next: Step) {
    setError(null);
    setStep(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submitDados(event: FormEvent) {
    event.preventDefault();
    const parsed = parentSignupSchema.safeParse(dados);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Confira os dados.");
    if (dados.password !== confirmPassword) return setError(PASSWORD_MISMATCH);
    setBusy(true);
    const result = await postJson("/api/family/parent/signup", dados);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    await refreshUser();
    go("renda");
  }

  function submitRenda(event: FormEvent) {
    event.preventDefault();
    if (renda.profession.trim().length < 2) return setError("Informe a profissão.");
    if (!renda.incomeRange) return setError("Escolha a faixa de renda.");
    go("filho");
  }

  function submitFilho(event: FormEvent) {
    event.preventDefault();
    const parsed = parentApplicationSchema.pick({ childName: true, childBirthDate: true, relationship: true, guardianshipDeclared: true }).safeParse({ ...filho, ...tutela });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Confira os dados do seu filho.");
    go("documentos");
  }

  async function submitDocumentos() {
    const documents = Object.values(docs).filter((d): d is DocumentRef => Boolean(d));
    const missing = missingParentDocuments(documents);
    if (missing.length > 0) return setError("Envie RG e CPF (ou a CNH) e a certidão de nascimento do seu filho (ou o termo de guarda/tutela).");
    setBusy(true);
    const result = await postJson("/api/family/parent/application", { ...renda, ...filho, ...tutela, documents, phone: dados.phone });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    await reload();
    go("enviado");
  }

  const setDoc = (kind: DocumentKind) => (ref: DocumentRef | null) => setDocs((d) => ({ ...d, [kind]: ref ?? undefined }));

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 pb-20 pt-10 sm:px-6 lg:px-10 lg:pt-16">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={step} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ type: "spring", stiffness: 300, damping: 28 }}>
          {step === "intro" ? (
            <section aria-labelledby="sou-pai-title" className="grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:gap-16">
              <div>
                <h1 id="sou-pai-title" className="text-[clamp(40px,9vw,72px)] font-semibold leading-[0.95] tracking-[-0.05em] text-ink">
                  Conta Pai
                </h1>
                <p className="mt-5 max-w-lg text-[17px] leading-relaxed text-muted-foreground sm:text-[19px]">
                  A conta digital do seu filho, com você no controle: mesada, limites e tudo o que ele faz na PRX, num só lugar.
                </p>
                <div className="mt-8 flex flex-wrap gap-3">
                  {memberLoggedIn ? null : (
                    <Button onClick={() => go(resumeAt ?? "dados")} disabled={loading}>
                      {resumeAt === "enviado" ? "Ver meu cadastro" : resumeAt ? "Continuar cadastro" : "Abrir Conta Pai"}
                    </Button>
                  )}
                  <Link href="/" className="glass-chip inline-flex min-h-12 cursor-pointer items-center rounded-full px-6 text-[15px] font-medium text-ink">
                    Já tenho Conta Pai
                  </Link>
                </div>
                {memberLoggedIn && (
                  <Notice className="mt-6 max-w-lg">Você está conectado com uma conta de membro. Para abrir a Conta Pai, saia e use o e-mail do responsável.</Notice>
                )}
                <p className="mt-6 max-w-lg text-[13px] leading-relaxed text-muted-foreground">
                  A Conta Pai não guarda dinheiro nem rende: ela existe para controle, segurança e mesada. O dinheiro sai do seu banco e vai direto para a conta do seu filho.
                </p>
              </div>
              <ul className="grid gap-3">
                {PROMISES.map((item, i) => (
                  <motion.li
                    key={item.title}
                    initial={{ opacity: 0, y: 18 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ type: "spring", stiffness: 300, damping: 28, delay: 0.08 * i }}
                    className={i === 0 ? "prx-holo rounded-[28px] p-6" : "glass rounded-[28px] p-6"}
                  >
                    <p className={i === 0 ? "text-[19px] font-semibold tracking-[-0.02em] text-white" : "text-[19px] font-semibold tracking-[-0.02em] text-ink"}>{item.title}</p>
                    <p className={i === 0 ? "mt-1.5 text-[15px] leading-relaxed text-white/85" : "mt-1.5 text-[15px] leading-relaxed text-muted-foreground"}>{item.body}</p>
                  </motion.li>
                ))}
              </ul>
            </section>
          ) : step === "enviado" ? (
            <section aria-labelledby="sou-pai-done" className="mx-auto max-w-lg text-center">
              <h1 id="sou-pai-done" className="text-[34px] font-semibold leading-tight tracking-[-0.04em] text-ink sm:text-[44px]">
                {parentState?.identity?.status === "active" ? "Conta Pai aprovada" : "Cadastro em análise"}
              </h1>
              <p className="mt-3 text-[16px] leading-relaxed text-muted-foreground">
                {parentState?.identity?.status === "active"
                  ? "Tudo certo. Abra a Conta Pai para criar o acesso do seu filho, programar a mesada e definir os limites."
                  : "Recebemos seus dados e documentos. A equipe PRX confere em até 2 dias úteis; você já pode entrar e acompanhar pela Conta Pai."}
              </p>
              <div className="mt-8 flex justify-center">
                <Button onClick={() => router.push("/")}>Abrir a Conta Pai</Button>
              </div>
            </section>
          ) : (
            <section aria-labelledby="sou-pai-step" className="mx-auto max-w-xl">
              <p className="text-[13px] font-medium text-muted-foreground">
                Passo {flowIndex + 1} de {FLOW.length}
              </p>
              <div className="mt-2">
                <ProgressBar value={flowIndex + 1} max={FLOW.length} label="Progresso do cadastro" />
              </div>
              <h1 id="sou-pai-step" className="mt-6 text-[32px] font-semibold leading-tight tracking-[-0.04em] text-ink sm:text-[40px]">
                {STEP_TITLE[step].title}
              </h1>
              <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{STEP_TITLE[step].body}</p>

              <div className="glass mt-6 rounded-[28px] p-5 sm:p-7">
                {step === "dados" && (
                  <form onSubmit={(e) => void submitDados(e)} className="space-y-4">
                    <Field label="Nome completo">{(id) => <Input id={id} autoComplete="name" value={dados.fullName} onChange={(e) => setDados({ ...dados, fullName: e.target.value })} required />}</Field>
                    <Field label="E-mail">{(id) => <Input id={id} type="email" autoComplete="email" value={dados.email} onChange={(e) => setDados({ ...dados, email: e.target.value })} required />}</Field>
                    <Field label="Senha" hint={PASSWORD_HINT}>
                      {(id, hint) => <Input id={id} type="password" autoComplete="new-password" aria-describedby={hint} value={dados.password} onChange={(e) => setDados({ ...dados, password: e.target.value })} required minLength={8} />}
                    </Field>
                    <Field label="Confirmar senha">
                      {(id) => <Input id={id} type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={8} />}
                    </Field>
                    <PasswordChecklist password={dados.password} confirm={confirmPassword} className="text-muted-foreground" />
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="CPF">{(id) => <Input id={id} inputMode="numeric" placeholder="000.000.000-00" value={dados.cpf} onChange={(e) => setDados({ ...dados, cpf: maskCpfInput(e.target.value) })} required />}</Field>
                      <Field label="Data de nascimento">{(id) => <Input id={id} type="date" autoComplete="bday" value={dados.birthDate} onChange={(e) => setDados({ ...dados, birthDate: e.target.value })} required className="cursor-pointer" />}</Field>
                    </div>
                    <Field label="Celular com DDD">{(id) => <Input id={id} type="tel" inputMode="tel" autoComplete="tel-national" placeholder="(11) 98888-7777" value={dados.phone} onChange={(e) => setDados({ ...dados, phone: maskPhone(e.target.value) })} required />}</Field>
                    <Checkbox
                      checked={dados.termsAccepted}
                      onChange={(checked) => setDados({ ...dados, termsAccepted: checked })}
                      label={
                        <>
                          Li e aceito os{" "}
                          <a href="/termos" target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline-offset-2 hover:underline">
                            Termos de Uso
                          </a>{" "}
                          e a{" "}
                          <a href="/privacidade" target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline-offset-2 hover:underline">
                            Política de Privacidade
                          </a>
                          .
                        </>
                      }
                    />
                    <StepActions error={error} busy={busy} submitLabel="Criar Conta Pai" onBack={() => go("intro")} />
                  </form>
                )}

                {step === "renda" && (
                  <form onSubmit={submitRenda} className="space-y-5">
                    <Field label="Profissão">{(id) => <Input id={id} autoComplete="organization-title" value={renda.profession} onChange={(e) => setRenda({ ...renda, profession: e.target.value })} required />}</Field>
                    <RadioCards
                      label="Renda mensal"
                      value={renda.incomeRange as IncomeRange}
                      onChange={(value) => setRenda({ ...renda, incomeRange: value })}
                      options={INCOME_RANGES.map((value) => ({ value, title: INCOME_LABEL[value] }))}
                    />
                    <StepActions error={error} busy={false} submitLabel="Continuar" onBack={resumeAt ? undefined : () => go("dados")} />
                  </form>
                )}

                {step === "filho" && (
                  <form onSubmit={submitFilho} className="space-y-4">
                    <Field label="Nome completo do seu filho">{(id) => <Input id={id} value={filho.childName} onChange={(e) => setFilho({ ...filho, childName: e.target.value })} required />}</Field>
                    <Field label="Data de nascimento dele" hint="A Conta Pai acompanha filhos com menos de 18 anos.">
                      {(id, hint) => (
                        <Input id={id} type="date" aria-describedby={hint} value={filho.childBirthDate} onChange={(e) => setFilho({ ...filho, childBirthDate: e.target.value })} required className="cursor-pointer" />
                      )}
                    </Field>
                    <Field label="Parentesco ou tutela">
                      {(id) => (
                        <Select id={id} value={tutela.relationship} onChange={(e) => setTutela({ ...tutela, relationship: e.target.value as Guardianship | "" })} required>
                          <option value="">Escolha</option>
                          {GUARDIANSHIPS.map((g) => (
                            <option key={g} value={g}>
                              {GUARDIANSHIP_LABEL[g]}
                            </option>
                          ))}
                        </Select>
                      )}
                    </Field>
                    <Checkbox
                      checked={tutela.guardianshipDeclared}
                      onChange={(checked) => setTutela({ ...tutela, guardianshipDeclared: checked })}
                      label="Declaro, sob as penas da lei, que sou mãe, pai ou responsável legal por este menor."
                    />
                    <StepActions error={error} busy={false} submitLabel="Continuar" onBack={() => go("renda")} />
                  </form>
                )}

                {step === "documentos" && (
                  <div className="space-y-3">
                    <DocumentPicker kind="rg" value={docs.rg ?? null} onChange={setDoc("rg")} optional={Boolean(docs.cnh)} hint="Frente e verso legíveis" />
                    <DocumentPicker kind="cpf" value={docs.cpf ?? null} onChange={setDoc("cpf")} optional={Boolean(docs.cnh)} hint="Pode ser o próprio RG, se tiver o número" />
                    <DocumentPicker kind="cnh" value={docs.cnh ?? null} onChange={setDoc("cnh")} optional hint="Substitui RG e CPF" />
                    {tutela.relationship === "tutor" || tutela.relationship === "guardiao" ? (
                      <DocumentPicker kind="guardianship_proof" value={docs.guardianship_proof ?? null} onChange={setDoc("guardianship_proof")} hint="Termo judicial de guarda ou tutela" />
                    ) : (
                      <DocumentPicker kind="child_certificate" value={docs.child_certificate ?? null} onChange={setDoc("child_certificate")} hint="Certidão de nascimento do seu filho" />
                    )}
                    <p className="text-[12px] leading-relaxed text-muted-foreground">Os documentos ficam em área privada, visíveis só para a equipe de análise, e são usados apenas para confirmar a responsabilidade legal (LGPD).</p>
                    <StepActions error={error} busy={busy} submitLabel="Enviar para análise" onBack={() => go("filho")} onSubmit={() => void submitDocumentos()} />
                  </div>
                )}
              </div>
            </section>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function StepActions({ error, busy, submitLabel, onBack, onSubmit }: { error: string | null; busy: boolean; submitLabel: string; onBack?: () => void; onSubmit?: () => void }): ReactNode {
  return (
    <div className="space-y-3 pt-2">
      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        {onBack ? (
          <Button type="button" variant="ghost" onClick={onBack} disabled={busy}>
            Voltar
          </Button>
        ) : (
          <span />
        )}
        <Button type={onSubmit ? "button" : "submit"} onClick={onSubmit} disabled={busy}>
          {busy ? "Enviando…" : submitLabel}
        </Button>
      </div>
    </div>
  );
}
