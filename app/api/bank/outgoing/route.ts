// Hello World
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/security";
import { PartnerError } from "@/lib/partners/errors";
import { firstIssue } from "@/lib/partners/types";
import { body, familyErrorResponse, requireUser } from "@/lib/family/http";
import { assertBankKycApproved } from "@/lib/kyc/guards";
import { getBankRepository } from "@/lib/bank/repository";
import { accountView } from "@/lib/bank/service";
import { asaasActiveFor, asaasDeps } from "@/lib/bank/asaas/deps";
import { cancelOutgoing, executeOutgoing, pendingRequest, prepareBill, prepareBillSchema, preparePix, preparePixSchema, type PreparedOutgoing } from "@/lib/bank/asaas/cash-out";
import { confirmationOffer, proofSchema, verifyProof } from "@/lib/bank/asaas/confirmation";

const NO_STORE = { "Cache-Control": "no-store" };

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("prepare_pix") }).loose(),
  z.object({ action: z.literal("prepare_bill") }).loose(),
  z.object({ action: z.literal("confirm"), requestId: z.string().min(1).max(64), proof: z.unknown() }),
  z.object({ action: z.literal("cancel"), requestId: z.string().min(1).max(64) }),
]);

/**
 * POST /api/bank/outgoing — saídas de dinheiro pelo banco parceiro (Asaas).
 *   prepare_pix   { method: "key", key, amount } | { method: "qr", payload, amount? }
 *   prepare_bill  { identificationField }
 *     → revisão (recebedor, valor, taxa) + como confirmar (biometria ou senha)
 *   confirm       { requestId, proof }  executa no Asaas (uma vez só por pedido)
 *   cancel        { requestId }
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    if (!asaasActiveFor(user.id)) throw new PartnerError("A ativação de contas ainda não está disponível neste ambiente.", 503);
    const rate = checkRateLimit(`bank_outgoing_${user.id}`, 20, 60);
    if (!rate.allowed) throw new PartnerError(`Muitas tentativas. Aguarde ${rate.resetInSeconds}s.`, 429);
    await assertBankKycApproved(user.id);

    const parsed = schema.safeParse(await body(req));
    if (!parsed.success) throw new PartnerError(firstIssue(parsed.error), 400);
    const input = parsed.data;
    const deps = asaasDeps();
    const transactions = () => getBankRepository(user.id).listTransactions(user.id, 500);

    const review = async (prepared: PreparedOutgoing) =>
      NextResponse.json({ success: true, prepared, confirmation: await confirmationOffer(req, user.id, prepared.requestId) }, { headers: NO_STORE });

    switch (input.action) {
      case "prepare_pix": {
        const pix = preparePixSchema.safeParse(input);
        if (!pix.success) throw new PartnerError(firstIssue(pix.error), 422);
        return review(await preparePix(user.id, pix.data, deps, await transactions()));
      }
      case "prepare_bill": {
        const bill = prepareBillSchema.safeParse(input);
        if (!bill.success) throw new PartnerError(firstIssue(bill.error), 422);
        return review(await prepareBill(user.id, bill.data, deps, await transactions()));
      }
      case "confirm": {
        const proof = proofSchema.safeParse(input.proof);
        if (!proof.success) throw new PartnerError(firstIssue(proof.error), 422);
        await pendingRequest(user.id, input.requestId, deps);
        await verifyProof(req, { id: user.id, email: user.email }, input.requestId, proof.data);
        const request = await executeOutgoing(user.id, input.requestId, deps, await transactions());
        return NextResponse.json(
          { success: true, request: { id: request.id, kind: request.kind, amount: request.amount, status: request.status }, account: await accountView(user.id) },
          { headers: NO_STORE }
        );
      }
      case "cancel":
        await cancelOutgoing(user.id, input.requestId, deps);
        return NextResponse.json({ success: true }, { headers: NO_STORE });
    }
  } catch (error) {
    return familyErrorResponse(error, "Não foi possível concluir a operação.");
  }
}
