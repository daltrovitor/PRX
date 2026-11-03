// Hello World
"use client";

import { useState, type FormEvent } from "react";
import { Button, Field, Input, Notice } from "@/components/app/ui";
import { PhotoPicker } from "@/components/insider/photo-picker";
import { PASSWORD_HINT } from "@/lib/password-policy";

interface SignupResponse {
  success?: boolean;
  existingAccount?: boolean;
  error?: string;
}

/** Cadastro do Insider no portal: foto, nome, @, e-mail e senha. Fica aguardando a aprovação da equipe PRX. */
export function InsiderSignupForm({ onBack }: { onBack: () => void }) {
  const [draft, setDraft] = useState({ name: "", handle: "", email: "", password: "" });
  const [photo, setPhoto] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ existingAccount: boolean } | null>(null);
  const set = (key: keyof typeof draft, value: string) => setDraft((prev) => ({ ...prev, [key]: value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/insider/signup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...draft, photo }) });
      const data = (await res.json()) as SignupResponse;
      if (!res.ok || !data.success) setError(data.error || "Não foi possível enviar o cadastro agora.");
      else setSent({ existingAccount: Boolean(data.existingAccount) });
    } catch {
      setError("Sem internet agora. Confira sua conexão e tente de novo.");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="space-y-5">
        <Notice tone="success">
          <span className="block font-medium">Cadastro enviado</span>
          <span className="mt-1 block">
            Agora é com a equipe PRX: assim que aprovar, você entra aqui com {draft.email}
            {sent.existingAccount ? " e a senha da sua conta PRX." : " e a senha que acabou de criar. A mesma conta já vale como membro no app."}
          </span>
        </Notice>
        <Button block variant="secondary" onClick={onBack}>
          Voltar para o login
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <PhotoPicker
        name={draft.name}
        src={photo || null}
        onPick={(url) => {
          setError(null);
          setPhoto(url);
        }}
        onError={setError}
      />
      <Field label="Nome (aparece para os membros)">{(id) => <Input id={id} autoComplete="name" required maxLength={80} value={draft.name} onChange={(e) => set("name", e.target.value)} />}</Field>
      <Field label="Seu @ do Instagram" hint="Sem o @: ele aparece como @usuario.">
        {(id, describedBy) => (
          <div className="flex items-center gap-2">
            <span aria-hidden className="text-ink">
              @
            </span>
            <Input id={id} aria-describedby={describedBy} autoCapitalize="none" autoCorrect="off" placeholder="usuario" value={draft.handle} onChange={(e) => set("handle", e.target.value.replace(/@/g, ""))} />
          </div>
        )}
      </Field>
      <Field label="E-mail" hint="Se você já tem conta PRX, use o mesmo e-mail e a senha dela.">
        {(id, describedBy) => <Input id={id} aria-describedby={describedBy} type="email" autoComplete="email" required value={draft.email} onChange={(e) => set("email", e.target.value)} />}
      </Field>
      <Field label="Senha" hint={PASSWORD_HINT}>
        {(id, describedBy) => <Input id={id} aria-describedby={describedBy} type="password" autoComplete="new-password" required value={draft.password} onChange={(e) => set("password", e.target.value)} />}
      </Field>
      {error && <Notice tone="error">{error}</Notice>}
      <Button type="submit" block disabled={busy}>
        {busy ? "Enviando…" : "Enviar cadastro"}
      </Button>
      <p className="text-[13px] leading-relaxed text-muted-foreground">
        Ao enviar, você aceita os{" "}
        <a href="/termos" className="cursor-pointer underline underline-offset-4 hover:text-ink">
          termos de uso
        </a>{" "}
        da PRX. O acesso ao portal só abre depois da aprovação da equipe.
      </p>
    </form>
  );
}
