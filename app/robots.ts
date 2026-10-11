// Hello World
import type { MetadataRoute } from "next";
import { TEASER_URL } from "@/lib/domains";

/** Buscadores: páginas públicas sim; API não. Os portais (admin, parceiro, equipe, insider) já saem com noindex. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: "/api/" },
    sitemap: `${TEASER_URL}/sitemap.xml`,
  };
}
