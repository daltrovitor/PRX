// Hello World
import { beforeEach, describe, expect, it } from "vitest";
import { userStore } from "@/lib/auth";
import { founderOf, isActiveFounder, listFounders, publicFounders, resetFounderMembersMemory, saveFounder } from "@/lib/founders/members";
import { brandAssetFor, getBrandAsset, saveBrandAsset } from "@/lib/brand/assets";
import { renderWelcomeEmail } from "@/lib/notifications/templates/welcome-email";

const account = (name: string) => userStore.createUser(`f${Date.now()}${Math.random().toString(36).slice(2, 6)}@prx.dev`, name, "Senha#2026x", "52998224725", "11988887777");

beforeEach(() => resetFounderMembersMemory());

describe("Founders da PRX", () => {
  it("liga à conta real, um cadastro por pessoa, e respeita status e vigência", async () => {
    const ana = account("Ana Founder");
    await expect(saveFounder({ userId: "nao-existe", displayName: "Xis" }, "admin@prx.dev")).rejects.toThrow(/Conta não encontrada/);
    const f = await saveFounder({ userId: ana.id, displayName: "Ana", headline: "Turma 2026", benefits: ["Acesso antecipado", ""] }, "admin@prx.dev");
    expect(f.benefits).toEqual(["Acesso antecipado"]);
    await expect(saveFounder({ userId: ana.id, displayName: "Ana de novo" }, "admin@prx.dev")).rejects.toThrow(/já é Founder/);
    expect(await isActiveFounder(ana.id)).toBe(true);
    expect((await listFounders({ q: "", offset: 0, limit: 10 })).items[0]).toMatchObject({ displayName: "Ana", accountName: "Ana Founder" });

    await saveFounder({ userId: ana.id, displayName: "Ana", status: "inactive" }, "admin@prx.dev", f.id);
    expect(await isActiveFounder(ana.id)).toBe(false);
    await saveFounder({ userId: ana.id, displayName: "Ana", endsAt: "2026-01-01T00:00:00.000Z", startsAt: "2025-01-01T00:00:00.000Z" }, "admin@prx.dev", f.id);
    expect(await isActiveFounder(ana.id, new Date("2026-10-16T00:00:00Z"))).toBe(false);
    expect(await publicFounders(new Date("2026-10-16T00:00:00Z"))).toEqual([]);

    const bia = account("Bia Founder");
    await saveFounder({ userId: bia.id, displayName: "Bia", showPublicly: false }, "admin@prx.dev");
    expect(await isActiveFounder(bia.id)).toBe(true);
    expect(await publicFounders()).toEqual([]);
    expect((await founderOf(bia.id))?.displayName).toBe("Bia");
  });

  it("imagem oficial: nada aparece até ser enviada e ativada, e só nos lugares marcados", async () => {
    expect(await brandAssetFor("founders_official_image", "app_home")).toBeNull();
    await expect(saveBrandAsset("founders_official_image", { url: null, alt: "", enabled: true, placements: ["app_home"] }, "admin@prx.dev")).rejects.toThrow(/Envie a imagem/);
    await saveBrandAsset("founders_official_image", { url: "https://cdn.prx.app.br/founders.png", alt: "", enabled: false, placements: ["app_home"] }, "admin@prx.dev");
    expect(await brandAssetFor("founders_official_image", "app_home")).toBeNull();
    await expect(saveBrandAsset("founders_official_image", { url: "https://cdn.prx.app.br/founders.png", alt: "", enabled: true, placements: ["app_home"] }, "a")).rejects.toThrow(/texto alternativo/);
    await saveBrandAsset("founders_official_image", { url: "https://cdn.prx.app.br/founders.png", alt: "Arte oficial do PRX Founders", enabled: true, placements: ["app_home", "emails"] }, "admin@prx.dev");
    expect(await brandAssetFor("founders_official_image", "app_home")).toEqual({ url: "https://cdn.prx.app.br/founders.png", alt: "Arte oficial do PRX Founders" });
    expect(await brandAssetFor("founders_official_image", "founders_tab")).toBeNull();
    expect((await getBrandAsset("founders_official_image")).updatedBy).toBe("admin@prx.dev");

    const base = { name: "Ana", email: "a@prx.dev", siteUrl: "https://prx.app.br", assetsUrl: "https://prx.app.br", startingCoins: 0 };
    expect(renderWelcomeEmail(base).html).not.toContain("Founders");
    expect(renderWelcomeEmail({ ...base, foundersImage: { url: "https://cdn.prx.app.br/founders.png", alt: "Arte" } }).html).toContain("https://cdn.prx.app.br/founders.png");
  });
});
