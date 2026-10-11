// Hello World
import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, requireAdmin } from "@/lib/partners/http";
import { pageParams } from "@/lib/admin/paging";
import { MEMBER_ROLES, MEMBER_SORTS, listMembers, type DirectoryRole, type MemberSort } from "@/lib/admin/members";
import { memberActivity } from "@/lib/admin/member-activity";

/**
 * GET /api/admin/members?page=&pageSize=&q=&role=&bank=&sort=   página do diretório (filtros no banco)
 * GET /api/admin/members?id=<usuário>                           histórico: vouchers e ingressos da conta
 */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);
    const q = req.nextUrl.searchParams;
    const id = q.get("id");
    if (id) return NextResponse.json({ success: true, ...(await memberActivity(id.slice(0, 80))) }, { headers: { "Cache-Control": "no-store" } });

    const role = q.get("role");
    const sort = q.get("sort");
    const result = await listMembers({
      ...pageParams(q),
      q: q.get("q") ?? undefined,
      role: MEMBER_ROLES.includes(role as DirectoryRole) ? (role as DirectoryRole) : undefined,
      bank: ["active", "pending_activation", "blocked", "none"].includes(q.get("bank") ?? "") ? (q.get("bank") as string) : undefined,
      sort: MEMBER_SORTS.includes(sort as MemberSort) ? (sort as MemberSort) : "recent",
    });
    return NextResponse.json({ success: true, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "Erro ao consultar os membros.");
  }
}
