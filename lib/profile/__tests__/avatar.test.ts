// Hello World
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { userStore } from "@/lib/auth";
import { AVATAR_MAX_BYTES, processAvatar, removeAvatar, setAvatar } from "@/lib/profile/avatar";

const account = () => userStore.createUser(`a${Date.now()}${Math.random().toString(36).slice(2, 6)}@prx.dev`, "Ana Foto", "Senha#2026x", "52998224725", "11988887777");

/** JPEG de verdade, retrato, com EXIF (inclusive um campo de GPS/descrição). */
async function photo(width = 800, height = 1200): Promise<Uint8Array> {
  const buffer = await sharp({ create: { width, height, channels: 3, background: { r: 120, g: 40, b: 200 } } })
    .jpeg()
    .withExif({ IFD0: { ImageDescription: "Rua das Flores, 123", Make: "Camera X" } })
    .toBuffer();
  return new Uint8Array(buffer);
}

describe("foto de perfil", () => {
  it("regrava em WebP 512×512 e tira os metadados da câmera", async () => {
    const source = await photo();
    expect((await sharp(source).metadata()).exif).toBeDefined();
    const out = await processAvatar(source);
    const meta = await sharp(out).metadata();
    expect(meta).toMatchObject({ format: "webp", width: 512, height: 512 });
    expect(meta.exif).toBeUndefined();
  });

  it("salva, troca e remove a foto da própria conta", async () => {
    const user = account();
    const first = await setAvatar(user.id, { bytes: await photo(), type: "image/jpeg" });
    expect(first.startsWith("data:image/webp;base64,")).toBe(true);
    expect(userStore.findById(user.id)?.avatarUrl).toBe(first);

    const second = await setAvatar(user.id, { bytes: await photo(600, 600), type: "image/jpeg" });
    expect(userStore.findById(user.id)?.avatarUrl).toBe(second);

    await removeAvatar(user.id);
    expect(userStore.findById(user.id)?.avatarUrl).toBe("");
  });

  it("recusa o que não é foto, arquivo vazio e arquivo grande", async () => {
    const user = account();
    await expect(setAvatar(user.id, { bytes: new TextEncoder().encode("<svg/>"), type: "image/svg+xml" })).rejects.toThrow(/JPG, PNG ou WebP/);
    await expect(setAvatar(user.id, { bytes: new TextEncoder().encode("não é imagem"), type: "image/jpeg" })).rejects.toThrow(/Não conseguimos ler/);
    await expect(setAvatar(user.id, { bytes: new Uint8Array(0), type: "image/png" })).rejects.toThrow(/vazio/);
    await expect(setAvatar(user.id, { bytes: new Uint8Array(AVATAR_MAX_BYTES + 1), type: "image/png" })).rejects.toThrow(/8 MB/);
    expect(userStore.findById(user.id)?.avatarUrl).toBe("");
  });

  it("conta inexistente não recebe foto", async () => {
    await expect(setAvatar("nao-existe", { bytes: await photo(), type: "image/jpeg" })).rejects.toThrow(/Conta não encontrada/);
  });
});
