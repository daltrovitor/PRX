// Hello World
import { describe, expect, it } from "vitest";
import { createPendingGoogleToken, isBlankProfile, verifyPendingGoogleToken } from "@/lib/google-pending";
import { isValidCpf } from "@/lib/partners/documents";

describe("Registro com CPF e Celular obrigatórios", () => {
  it("valida CPF corretamente", () => {
    expect(isValidCpf("52998224725")).toBe(true);
    expect(isValidCpf("529.982.247-25")).toBe(true);
    expect(isValidCpf("11111111111")).toBe(false);
    expect(isValidCpf("12345678900")).toBe(false);
  });

  it("cria e valida token temporário do Google para cadastro pendente", () => {
    const token = createPendingGoogleToken({
      email: "teste@gmail.com",
      fullName: "Usuário Teste",
      avatarUrl: "https://avatar.dev/1",
    });

    expect(token).toBeTruthy();
    const verified = verifyPendingGoogleToken(token);
    expect(verified).not.toBeNull();
    expect(verified?.email).toBe("teste@gmail.com");
    expect(verified?.fullName).toBe("Usuário Teste");
    expect(verified?.avatarUrl).toBe("https://avatar.dev/1");
  });

  it("o token do Google leva o aviso de boas-vindas; tokens antigos não trazem o campo", () => {
    const novo = verifyPendingGoogleToken(createPendingGoogleToken({ authUserId: "abc", welcome: true, email: "a@b.com", fullName: "A B" }));
    expect(novo).toMatchObject({ authUserId: "abc", welcome: true });
    expect(verifyPendingGoogleToken(createPendingGoogleToken({ email: "a@b.com", fullName: "A B" }))?.welcome).toBeUndefined();
  });

  it("perfil vazio (o que o gatilho do banco cria quando o Google cria o acesso) é cadastro novo", () => {
    expect(isBlankProfile(null)).toBe(true);
    expect(isBlankProfile({})).toBe(true);
    expect(isBlankProfile({ cpf: null, phone: null, terms_accepted_at: null, role: "user" })).toBe(true);
    // quem já passou pelo cadastro (CPF, celular ou aceite dos Termos) não é novo
    expect(isBlankProfile({ cpf: "52998224725" })).toBe(false);
    expect(isBlankProfile({ phone: "11988887777" })).toBe(false);
    expect(isBlankProfile({ terms_accepted_at: "2026-09-28T12:00:00Z" })).toBe(false);
    // contas de equipe nunca contam como cadastro de membro
    expect(isBlankProfile({ role: "admin" })).toBe(false);
    expect(isBlankProfile({ role: "partner" })).toBe(false);
  });

  it("recusa token temporário do Google adulterado", () => {
    const token = createPendingGoogleToken({
      email: "teste@gmail.com",
      fullName: "Usuário Teste",
    });

    const [body] = token.split(".");
    const tampered = `${body}.assinatura_invalida`;
    expect(verifyPendingGoogleToken(tampered)).toBeNull();
  });
});
