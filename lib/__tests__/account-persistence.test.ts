import { beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({
  save: vi.fn(), deleteUser: vi.fn(), createUser: vi.fn(),
}));
vi.mock("@/lib/supabase/client", () => ({ supabaseAdmin: {
  auth: { admin: { createUser: db.createUser, deleteUser: db.deleteUser } },
  from: () => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
    upsert: () => ({ select: () => ({ single: db.save }) }),
  }),
} }));
import { createAccount } from "@/lib/accounts";
const input = { email: "new@example.com", fullName: "Novo Membro", password: "Example123!", cpf: "529.982.247-25", phone: "(11) 98888-7777" };
beforeEach(() => {
  vi.clearAllMocks();
  db.createUser.mockResolvedValue({ data: { user: { id: "new-user" } }, error: null });
  db.deleteUser.mockResolvedValue({ error: null });
});
describe("persistência do cadastro antes de emitir sessão", () => {
  it("confirma os dados persistidos e normalizados", async () => {
    db.save.mockResolvedValue({ data: { id: "new-user", cpf: "52998224725", phone: "11988887777" }, error: null });
    expect(await createAccount(input)).toMatchObject({ cpf: "52998224725", phone: "11988887777" });
    expect(db.deleteUser).not.toHaveBeenCalled();
  });
  it.each([
    { data: null, error: { message: "database unavailable" } },
    { data: { id: "new-user", cpf: null, phone: null }, error: null },
  ])("não aceita cadastro sem os dados gravados e desfaz o acesso incompleto", async (result) => {
    db.save.mockResolvedValue(result);
    await expect(createAccount(input)).rejects.toThrow("Não foi possível salvar o cadastro");
    expect(db.deleteUser).toHaveBeenCalledWith("new-user");
  });
});
