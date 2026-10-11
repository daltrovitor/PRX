// Hello World
import { afterEach, describe, expect, it, vi } from "vitest";
import { TAGLINES, sessionTaglineIndex } from "@/lib/taglines";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** sessionStorage de mentira; sem argumento começa vazio. */
function stubSession(saved?: string) {
  const store = new Map<string, string>(saved === undefined ? [] : [["prx:tagline", saved]]);
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
  });
  return store;
}

describe("frases do manifesto", () => {
  it("são 100, sem repetição, e a primeira é a padrão", () => {
    expect(TAGLINES).toHaveLength(100);
    expect(new Set(TAGLINES).size).toBe(TAGLINES.length);
    expect(TAGLINES[0]).toBe("O futuro não se assiste. / Se constrói.");
  });

  it("cada frase tem uma ou duas linhas, sem espaço sobrando", () => {
    for (const phrase of TAGLINES) {
      const lines = phrase.split(" / ");
      expect(lines.length, phrase).toBeLessThanOrEqual(2);
      for (const line of lines) {
        expect(line, phrase).not.toBe("");
        expect(line, phrase).toBe(line.trim());
      }
    }
  });
});

describe("sorteio por sessão", () => {
  it("sorteia uma vez e repete a mesma frase durante a sessão", () => {
    const store = stubSession();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const first = sessionTaglineIndex();
    expect(first).toBe(50);
    expect(store.get("prx:tagline")).toBe("50");

    vi.spyOn(Math, "random").mockReturnValue(0.99);
    expect(sessionTaglineIndex()).toBe(50);
  });

  it("ignora um índice guardado que não existe mais na lista", () => {
    const store = stubSession("999");
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect(sessionTaglineIndex()).toBe(0);
    expect(store.get("prx:tagline")).toBe("0");
  });

  it("sem sessionStorage (modo privado) cai na frase padrão", () => {
    vi.stubGlobal("sessionStorage", {
      getItem: () => {
        throw new Error("bloqueado");
      },
      setItem: () => {
        throw new Error("bloqueado");
      },
    });
    expect(sessionTaglineIndex()).toBe(0);
  });
});
