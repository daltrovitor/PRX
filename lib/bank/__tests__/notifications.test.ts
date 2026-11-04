// Hello World
import { afterEach, describe, expect, it } from "vitest";
import { getBankNotificationStore, setBankNotificationStoreForTests } from "@/lib/bank/notifications";

const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

afterEach(() => setBankNotificationStoreForTests(null));

describe("avisos do PRX BANK", () => {
  it("um aviso por evento e leitura só do próprio membro", async () => {
    const store = getBankNotificationStore();
    const base = { userId: USER, eventType: "PRX_IDENTITY", title: "Identidade confirmada", body: "", amount: null };
    const event = `evt_${Math.random().toString(36).slice(2)}`;
    expect(await store.insertNotification({ ...base, eventId: event })).toBe(true);
    expect(await store.insertNotification({ ...base, eventId: event })).toBe(false);
    await store.insertNotification({ ...base, userId: OTHER, eventId: `${event}_outro` });
    await store.markNotificationsRead(USER, "all");
    expect((await store.listNotifications(USER, 10)).every((n) => n.readAt)).toBe(true);
    expect((await store.listNotifications(OTHER, 10))[0].readAt).toBeNull();
  });
});
