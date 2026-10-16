// Hello World
import { NextResponse, type NextRequest } from "next/server";
import { brandAssetFor } from "@/lib/brand/assets";
import { checkRateLimit } from "@/lib/security";
import { PartnerError } from "@/lib/partners/errors";
import { errorResponse, requireAdmin } from "@/lib/partners/http";
import { canSimulateDelivery, emailConfig, publicSiteUrl, whatsappConfig } from "@/lib/notifications/config";
import { deliveryHistory } from "@/lib/notifications/log";
import { buildWelcomeEmail, sendWelcomeEmail } from "@/lib/notifications/welcome";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * GET /api/admin/notifications — canais configurados (sem segredos) e últimos envios.
 * GET /api/admin/notifications?preview=welcome&nome=Gabi — o e-mail de boas-vindas em HTML
 * (&formato=texto para a versão em texto puro). No desenvolvimento a prévia abre sem login.
 */
export async function GET(req: NextRequest) {
  try {
    const preview = req.nextUrl.searchParams.get("preview");
    if (preview !== null) {
      if (!canSimulateDelivery()) await requireAdmin(req);
      if (preview !== "welcome") throw new PartnerError("Prévia disponível: welcome.", 404);
      const name = (req.nextUrl.searchParams.get("nome") || "Gabi").slice(0, 80);
      const email = buildWelcomeEmail({ fullName: name, email: "membro@prx.app.br" }, req.nextUrl.origin, await brandAssetFor("founders_official_image", "emails").catch(() => null));
      if (req.nextUrl.searchParams.get("formato") === "texto") {
        return new NextResponse(email.text, { headers: { ...NO_STORE, "Content-Type": "text/plain; charset=utf-8" } });
      }
      return new NextResponse(email.html, {
        headers: { ...NO_STORE, "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": "default-src 'none'; img-src https: http: data:; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com" },
      });
    }

    await requireAdmin(req);
    const email = emailConfig();
    const whatsapp = whatsappConfig();
    const history = await deliveryHistory(50);
    return NextResponse.json(
      {
        channels: {
          email: { provider: "resend", configured: Boolean(email.apiKey), from: email.from },
          whatsapp: { provider: "whatsapp_cloud", configured: Boolean(whatsapp.accessToken && whatsapp.phoneNumberId), template: whatsapp.otpTemplate, language: whatsapp.language },
        },
        // Para onde levam os links e as imagens do e-mail (NEXT_PUBLIC_SITE_URL).
        siteUrl: publicSiteUrl(),
        deliveries: history.records,
        logAvailable: history.available,
      },
      { headers: NO_STORE },
    );
  } catch (error) {
    return errorResponse(error, "Erro ao carregar as notificações.");
  }
}

/** POST /api/admin/notifications — envia o e-mail de boas-vindas de teste para o próprio admin. */
export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin(req);
    const rate = checkRateLimit(`admin_notify_${admin.sub}`, 5, 600);
    if (!rate.allowed) throw new PartnerError(`Muitos envios de teste. Tente em ${rate.resetInSeconds}s.`, 429);
    if (!admin.email) throw new PartnerError("A sessão do admin não tem e-mail.", 400);
    const result = await sendWelcomeEmail({ id: admin.sub, email: admin.email, fullName: admin.name || "Admin PRX" }, { test: true });
    return NextResponse.json({ success: result.status === "sent" || result.status === "simulated", result }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error, "Não foi possível enviar o e-mail de teste.");
  }
}
