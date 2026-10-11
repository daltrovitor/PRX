// Hello World
import type { MetadataRoute } from "next";
import { TEASER_URL } from "@/lib/domains";

/** Páginas públicas do domínio principal (prx.app.br): o teaser com a Lista de Espera e os documentos legais. */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${TEASER_URL}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${TEASER_URL}/termos`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${TEASER_URL}/privacidade`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${TEASER_URL}/termos-qrcode`, changeFrequency: "monthly", priority: 0.2 },
  ];
}
