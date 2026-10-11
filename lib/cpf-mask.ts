// Hello World

/** Máscara de CPF enquanto digita: 000.000.000-00 (a validação real é no servidor, com os dígitos verificadores). */
export function maskCpfInput(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 11);
  return d.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

export const formatCpf = maskCpfInput;
