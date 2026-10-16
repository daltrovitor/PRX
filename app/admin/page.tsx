// Hello World
import type { Metadata } from "next";
import { AdminApp } from "@/components/admin/admin-app";
import { verifyAdminRequest } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Painel administrativo",
  description: "Gestão de membros, benefícios, missões e vouchers da PRX.",
  robots: { index: false, follow: false },
};

/** A sessão é verificada no servidor: o HTML já chega com o login ou com o painel. */
export default async function AdminPage() {
  const auth = await verifyAdminRequest();
  const identity = auth.authorized ? { name: auth.adminUser?.name, email: auth.adminUser?.email } : null;
  return <AdminApp initialAdmin={identity} />;
}
