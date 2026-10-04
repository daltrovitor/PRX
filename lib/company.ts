// Hello World

/**
 * Identificação da empresa nas páginas públicas e documentos legais.
 * Atualizado com dados corporativos oficiais e nova assinatura da marca.
 */
export const COMPANY = {
  brand: "PRX",
  legalName: process.env.NEXT_PUBLIC_PRX_LEGAL_NAME || "PRX",
  cnpj: process.env.NEXT_PUBLIC_PRX_CNPJ || "68.025.417/0001-42",
  cnpjRaw: "68025417000142",
  cityState: "Goiânia — GO · Brasil",
  /** Canal do Encarregado de Dados (DPO), art. 41 da LGPD. */
  dpoEmail: process.env.NEXT_PUBLIC_PRX_DPO_EMAIL || "privacidade@prx.app.br",
  supportEmail: process.env.NEXT_PUBLIC_PRX_SUPPORT_EMAIL || "suporte@prx.app.br",
  domain: "prx.app.br",
  tagline: "the next pays",
} as const;
