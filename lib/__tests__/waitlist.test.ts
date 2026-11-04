// Hello World
import { describe, expect, it } from "vitest";
import { maskPhoneInput } from "@/components/marketing/teaser/teaser-prereg-dialog";
import { waitlistSchema } from "@/lib/waitlist";

const valid = { name: "Ana Souza", email: " Ana@Exemplo.com ", phone: "(11) 91234-5678", age: 17, consent: true };
const firstMessage = (input: unknown) => {
  const r = waitlistSchema.safeParse(input);
  return r.success ? null : r.error.issues[0]?.message;
};

describe("pré-cadastro da lista de espera", () => {
  it("normaliza e-mail em minúsculas e celular só com dígitos", () => {
    const r = waitlistSchema.parse(valid);
    expect(r).toMatchObject({ email: "ana@exemplo.com", phone: "11912345678", age: 17, name: "Ana Souza" });
  });

  it("aceita fixo com DDD (10 dígitos)", () => {
    expect(waitlistSchema.parse({ ...valid, phone: "1133334444" }).phone).toBe("1133334444");
  });

  it("exige nome, celular com DDD e idade", () => {
    expect(firstMessage({ ...valid, name: " " })).toBe("Informe seu nome.");
    expect(firstMessage({ ...valid, phone: "91234-5678" })).toBe("Informe o celular com DDD.");
    expect(firstMessage({ ...valid, age: null })).toBe("Informe sua idade.");
    expect(firstMessage({ ...valid, age: 17.5 })).toBe("Informe sua idade em anos.");
  });

  it("recusa menores de 12 anos e idades absurdas", () => {
    expect(firstMessage({ ...valid, age: 11 })).toBe("A PRX é para quem tem 12 anos ou mais.");
    expect(waitlistSchema.safeParse({ ...valid, age: 12 }).success).toBe(true);
    expect(firstMessage({ ...valid, age: 121 })).toBe("Informe uma idade válida.");
  });

  it("exige e-mail válido e o aceite de contato", () => {
    expect(firstMessage({ ...valid, email: "nao-e-email" })).toBe("Informe um e-mail válido.");
    expect(firstMessage({ ...valid, consent: false })).toBe("Autorize o contato para entrar na lista.");
  });
});

describe("máscara do celular no formulário", () => {
  it.each([
    ["", ""],
    ["1", "1"],
    ["119", "(11) 9"],
    ["1191234", "(11) 9123-4"],
    ["1133334444", "(11) 3333-4444"],
    ["11912345678", "(11) 91234-5678"],
    ["(11) 91234-5678999", "(11) 91234-5678"],
  ])("%s -> %s", (input, expected) => {
    expect(maskPhoneInput(input)).toBe(expected);
  });
});
