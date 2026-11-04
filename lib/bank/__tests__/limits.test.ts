// Hello World
import { describe, expect, it } from "vitest";
import { assertNightLimit, nightWindowStart } from "@/lib/bank/limits";

describe("limite noturno de Pix", () => {
  it("período noturno vai das 20h às 6h de Brasília", () => {
    expect(nightWindowStart(new Date("2026-10-02T00:30:00Z"))).toBe("2026-10-01T23:00:00.000Z"); // 21h30 BRT
    expect(nightWindowStart(new Date("2026-10-02T07:00:00Z"))).toBe("2026-10-01T23:00:00.000Z"); // 4h BRT
    expect(nightWindowStart(new Date("2026-10-01T23:00:00Z"))).toBe("2026-10-01T23:00:00.000Z"); // 20h BRT
    expect(nightWindowStart(new Date("2026-10-01T15:00:00Z"))).toBeNull(); // 12h BRT
    expect(nightWindowStart(new Date("2026-10-02T09:00:00Z"))).toBeNull(); // 6h BRT
  });

  it("soma o que já saiu na noite", async () => {
    const night = new Date("2026-10-02T01:00:00Z");
    await expect(assertNightLimit(200, night, async () => 900)).rejects.toMatchObject({ status: 403 });
    await expect(assertNightLimit(100, night, async () => 900)).resolves.toBeUndefined();
    await expect(assertNightLimit(5000, new Date("2026-10-01T15:00:00Z"), async () => 0)).resolves.toBeUndefined();
  });
});
