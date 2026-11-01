// Hello World
"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import { Avatar, Button, Field, Input, Notice } from "@/components/app/ui";
import { IconUpload } from "@/components/icons/prx-icons";
import { compressImageFile } from "@/lib/media/compression";
import { PASSWORD_HINT } from "@/lib/password-policy";

interface SignupResponse {
  success?: boolean;
  existingAccount?: boolean;
  error?: string;
}

const readAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

/** Cadastro do Insider no portal: foto, nome, @, e-mail e senha. Fica aguardando a aprovação da equipe PRX. */
export function InsiderSignupForm({ onBack }: { onBack: () => void }) {
  const [draft, setDraft] = useState({ name: "", handle: "", email: "", password: "" });
  const [photo, setPhoto] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ existingAccount: boolean } | null>(null);
  const set = (key: keyof typeof draft, value: string) => setDraft((prev) => ({ ...prev, [key]: value }));

  async function pickPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError(null);
    try {
      setPhoto(await readAsDataUrl(await compressImageFile(file, { maxWidth: 800, maxHeight: 800, quality: 0.82, minBytesToCompress: 0 })));
    } catch {
      setError("Não conseguimos ler esta imagem. Escolha outra foto.");
    }
  }

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
      <div className="flex items-center gap-4">
        <Avatar name={draft.name || "Insider"} src={photo || null} size={64} />
        <label className="inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-xl bg-surface px-4 text-sm text-ink transition-colors hover:bg-line has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring">
          <IconUpload size={16} />
          {photo ? "Trocar foto" : "Enviar foto"}
          <input type="file" accept="image/*" className="sr-only" onChange={(e) => void pickPhoto(e)} />
        </label>
      </div>
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
