// Hello World
"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { ShieldCheck, ShieldAlert, CheckCircle2, XCircle, Calendar, MapPin, Building, User, AlertCircle, ArrowRight } from "lucide-react";
import { maskCpfInput, formatCpf } from "@/lib/cpf-mask";

interface AuthorizationData {
  token: string;
  status: "pending" | "approved" | "rejected";
  ticketId: string;
  ticketCode: string;
  holderName: string;
  childEmail: string;
  parentEmail: string;
  event: {
    id: string;
    title: string;
    seriesLabel: string;
    startsAt: string;
    venue: string;
    city: string;
    address: string;
    ageRating: string;
    organizerName: string;
  };
  consent: {
    guardianEmail: string;
    status: "pending" | "approved" | "rejected";
    token: string;
    guardianName?: string | null;
    guardianCpf?: string | null;
    relationship?: string | null;
    guardianPhone?: string | null;
    respondedAt?: string | null;
    rejectionReason?: string | null;
  };
}

export default function AutorizacaoPage({ params }: { params: Promise<{ token: string }> }) {
  const resolvedParams = use(params);
  const token = resolvedParams.token;

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AuthorizationData | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [guardianName, setGuardianName] = useState("");
  const [guardianCpf, setGuardianCpf] = useState("");
  const [relationship, setRelationship] = useState("Pai / Mãe");
  const [guardianPhone, setGuardianPhone] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        setLoading(true);
        const res = await fetch(`/api/live/authorization?token=${encodeURIComponent(token)}`);
        const json = await res.json();
        if (!active) return;
        if (!res.ok || !json.success) {
          setError(json.error || "Pedido de autorização não encontrado ou expirado.");
        } else {
          setData(json.authorization);
        }
      } catch {
        if (active) setError("Não foi possível carregar a autorização. Verifique sua conexão.");
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [token]);

  async function handleDecision(action: "approve" | "reject") {
    setSubmitError(null);
    if (action === "approve") {
      if (!guardianName.trim()) {
        setSubmitError("Informe seu nome completo.");
        return;
      }
      const rawCpf = guardianCpf.replace(/\D/g, "");
      if (rawCpf.length !== 11) {
        setSubmitError("Informe um CPF válido com 11 dígitos.");
        return;
      }
      if (!acceptedTerms) {
        setSubmitError("Você precisa confirmar a declaração de responsabilidade.");
        return;
      }
    }

    try {
      setSubmitting(true);
      const res = await fetch("/api/live/authorization", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          action,
          guardianName: action === "approve" ? guardianName.trim() : undefined,
          guardianCpf: action === "approve" ? guardianCpf : undefined,
          relationship: action === "approve" ? relationship : undefined,
          guardianPhone: action === "approve" ? guardianPhone.trim() : undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        setSubmitError(json.error || "Erro ao registrar autorização.");
      } else {
        setData(json.authorization);
      }
    } catch {
      setSubmitError("Falha na comunicação com o servidor. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }

  const dateFormatted = data?.event.startsAt
    ? new Date(data.event.startsAt).toLocaleDateString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        weekday: "long",
        day: "2-digit",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  return (
    <main className="min-h-screen bg-[#ffffff] selection:bg-[#6c0cf0] selection:text-white text-neutral-900 px-4 py-8 sm:py-12 antialiased">
      <div className="max-w-2xl mx-auto space-y-8">
        {/* Top Header */}
        <header className="flex items-center justify-between border-b border-neutral-200 pb-5">
          <div className="flex items-center gap-3">
            <span className="text-xl font-bold tracking-wider text-black">PRX</span>
            <span className="text-xs uppercase tracking-widest text-neutral-600 font-medium">LIVE · Termo de Autorização</span>
          </div>
          <Link href="/" className="text-xs text-neutral-600 hover:text-black transition-colors cursor-pointer">
            Conhecer o PRX
          </Link>
        </header>

        {loading ? (
          <div className="py-20 text-center space-y-4">
            <div className="inline-block w-8 h-8 border-2 border-neutral-300 border-t-[#6c0cf0] rounded-full animate-spin" />
            <p className="text-sm text-neutral-600 font-medium">Carregando dados da autorização…</p>
          </div>
        ) : error || !data ? (
          <div className="border border-red-200 bg-red-50/60 rounded-md p-6 text-center space-y-3">
            <ShieldAlert className="w-10 h-10 text-red-600 mx-auto" />
            <h1 className="text-lg font-semibold text-red-900">Link Não Disponível</h1>
            <p className="text-sm text-red-700 leading-relaxed">{error ?? "Autorização não encontrada."}</p>
            <p className="text-xs text-red-600/80 pt-2">Se você solicitou um novo envio, certifique-se de utilizar o link mais recente recebido no seu e-mail.</p>
          </div>
        ) : data.status === "approved" ? (
          /* Approved State */
          <div className="space-y-6">
            <div className="border border-emerald-200 bg-emerald-50/70 rounded-md p-6 sm:p-8 space-y-4">
              <div className="flex items-center gap-3 text-emerald-800">
                <CheckCircle2 className="w-8 h-8 text-emerald-600 shrink-0" />
                <div>
                  <h1 className="text-lg font-bold text-emerald-950">Autorização Concedida com Sucesso</h1>
                  <p className="text-xs text-emerald-700">Liberação oficial registrada no sistema PRX e válida perante a portaria do evento.</p>
                </div>
              </div>

              <div className="divide-y divide-emerald-200/80 pt-2 text-sm text-emerald-900">
                <div className="py-2.5 flex justify-between">
                  <span className="text-emerald-700">Participante</span>
                  <span className="font-semibold">{data.holderName}</span>
                </div>
                <div className="py-2.5 flex justify-between">
                  <span className="text-emerald-700">Evento</span>
                  <span className="font-semibold">{data.event.title}</span>
                </div>
                <div className="py-2.5 flex justify-between">
                  <span className="text-emerald-700">Responsável legal</span>
                  <span className="font-semibold">{data.consent.guardianName ?? "Responsável"}</span>
                </div>
                <div className="py-2.5 flex justify-between">
                  <span className="text-emerald-700">CPF do responsável</span>
                  <span className="font-mono">{data.consent.guardianCpf ? formatCpf(data.consent.guardianCpf) : "Conferido"}</span>
                </div>
                <div className="py-2.5 flex justify-between">
                  <span className="text-emerald-700">Grau de parentesco</span>
                  <span>{data.consent.relationship ?? "Responsável Legal"}</span>
                </div>
                <div className="py-2.5 flex justify-between">
                  <span className="text-emerald-700">Código do ingresso</span>
                  <span className="font-mono font-semibold">{data.ticketCode}</span>
                </div>
              </div>
            </div>

            <div className="border border-neutral-200 bg-neutral-50 rounded-md p-5 text-xs text-neutral-600 leading-relaxed space-y-2">
              <p className="font-semibold text-neutral-800">Próximos passos:</p>
              <p>O ingresso digital de {data.holderName} já se encontra atualizado no app PRX. Na entrada do evento, a portaria confirmará a identificação oficial com foto do menor e a presente liberação digital assinada por você.</p>
            </div>
          </div>
        ) : data.status === "rejected" ? (
          /* Rejected State */
          <div className="border border-neutral-300 bg-neutral-50 rounded-md p-6 text-center space-y-4">
            <XCircle className="w-10 h-10 text-neutral-500 mx-auto" />
            <h1 className="text-lg font-bold text-neutral-900">Autorização Recusada</h1>
            <p className="text-sm text-neutral-600 max-w-md mx-auto leading-relaxed">
              Você optou por não autorizar a participação de <strong className="text-neutral-900">{data.holderName}</strong> no evento <strong className="text-neutral-900">{data.event.title}</strong>. O ingresso correspondente não terá acesso liberado na portaria.
            </p>
          </div>
        ) : (
          /* Pending Authorization Form */
          <div className="space-y-6">
            <div>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#6c0cf0]/10 text-[#6c0cf0] text-xs font-semibold mb-3">
                <ShieldCheck className="w-3.5 h-3.5" />
                Autorização Obrigatória de Menor de Idade
              </span>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-neutral-950">
                Liberação de Entrada no Evento
              </h1>
              <p className="mt-2 text-sm text-neutral-600 leading-relaxed">
                Seu filho(a) ou dependente menor de 18 anos solicitou um ingresso para o evento abaixo. Revise as informações e confirme a autorização legal de participação.
              </p>
            </div>

            {/* Event Info Card */}
            <div className="border border-neutral-200 bg-neutral-50/80 rounded-md p-5 space-y-3.5">
              <div className="flex items-start justify-between gap-3 border-b border-neutral-200 pb-3">
                <div>
                  <p className="text-xs font-semibold text-[#6c0cf0] uppercase tracking-wider">{data.event.seriesLabel}</p>
                  <h2 className="text-lg font-bold text-neutral-950 mt-0.5">{data.event.title}</h2>
                </div>
                <span className="px-2.5 py-1 text-xs font-bold rounded bg-neutral-200 text-neutral-800 shrink-0">
                  {data.event.ageRating}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-neutral-700">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-neutral-600 shrink-0" />
                  <span>{dateFormatted}</span>
                </div>
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-neutral-600 shrink-0" />
                  <span>{data.event.venue}, {data.event.city}</span>
                </div>
                {data.event.organizerName && (
                  <div className="flex items-center gap-2">
                    <Building className="w-4 h-4 text-neutral-600 shrink-0" />
                    <span>Org: {data.event.organizerName}</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-neutral-600 shrink-0" />
                  <span>Participante: <strong>{data.holderName}</strong> ({data.childEmail})</span>
                </div>
              </div>
            </div>

            {/* Authorization Form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleDecision("approve");
              }}
              className="border border-neutral-200 bg-white rounded-md p-5 sm:p-6 space-y-5"
            >
              <h2 className="text-base font-bold text-neutral-950 flex items-center gap-2">
                Dados do Responsável Legal
              </h2>

              <div className="space-y-4">
                <div>
                  <label htmlFor="guardian-name" className="block text-xs font-semibold text-neutral-800 mb-1">
                    Nome Completo do Responsável *
                  </label>
                  <input
                    id="guardian-name"
                    type="text"
                    required
                    value={guardianName}
                    onChange={(e) => setGuardianName(e.target.value)}
                    placeholder="Nome completo conforme RG/CPF"
                    className="w-full px-3.5 py-2.5 text-sm rounded-md border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-[#6c0cf0] focus:border-transparent bg-white text-neutral-900"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="guardian-cpf" className="block text-xs font-semibold text-neutral-800 mb-1">
                      CPF do Responsável *
                    </label>
                    <input
                      id="guardian-cpf"
                      type="text"
                      required
                      maxLength={14}
                      value={guardianCpf}
                      onChange={(e) => setGuardianCpf(formatCpf(e.target.value))}
                      placeholder="000.000.000-00"
                      className="w-full px-3.5 py-2.5 text-sm rounded-md border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-[#6c0cf0] focus:border-transparent font-mono bg-white text-neutral-900"
                    />
                  </div>

                  <div>
                    <label htmlFor="guardian-rel" className="block text-xs font-semibold text-neutral-800 mb-1">
                      Grau de Parentesco *
                    </label>
                    <select
                      id="guardian-rel"
                      value={relationship}
                      onChange={(e) => setRelationship(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm rounded-md border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-[#6c0cf0] focus:border-transparent cursor-pointer bg-white text-neutral-900"
                    >
                      <option value="Pai / Mãe">Pai / Mãe</option>
                      <option value="Tutor(a) Legal">Tutor(a) Legal</option>
                      <option value="Guardião(ã) Judicial">Guardião(ã) Judicial</option>
                      <option value="Outro Responsável Legal">Outro Responsável Legal</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label htmlFor="guardian-phone" className="block text-xs font-semibold text-neutral-800 mb-1">
                    Telefone para Contato (opcional)
                  </label>
                  <input
                    id="guardian-phone"
                    type="tel"
                    value={guardianPhone}
                    onChange={(e) => setGuardianPhone(e.target.value)}
                    placeholder="(00) 00000-0000"
                    className="w-full px-3.5 py-2.5 text-sm rounded-md border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-[#6c0cf0] focus:border-transparent bg-white text-neutral-900"
                  />
                </div>
              </div>

              {/* Legal Declaration */}
              <div className="border border-neutral-200 bg-neutral-50/90 rounded-md p-4 text-xs text-neutral-700 space-y-2.5 leading-relaxed">
                <p className="font-semibold text-neutral-900">Termo de Consentimento e Responsabilidade (ECA - Lei Federal nº 8.069/1990):</p>
                <p>
                  Declaro sob as penas da lei que sou pai, mãe ou responsável legal do(a) participante menor de idade indicado(a), tendo ciência plena do horário, local e classificação indicativa do evento. Autorizo expressamente sua entrada, permanência e participação, responsabilizando-me pela veracidade das informações ora prestadas.
                </p>
                <label className="flex items-start gap-2.5 pt-1 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={acceptedTerms}
                    onChange={(e) => setAcceptedTerms(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-neutral-300 text-[#6c0cf0] focus:ring-[#6c0cf0] cursor-pointer"
                  />
                  <span className="font-medium text-neutral-900">
                    Confirmo a declaração acima e autorizo a participação de {data.holderName}.
                  </span>
                </label>
              </div>

              {submitError && (
                <div className="flex items-center gap-2 p-3 rounded-md bg-red-50 text-red-700 text-xs border border-red-200">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                  <span>{submitError}</span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="pt-2 flex flex-col sm:flex-row gap-3">
                <button
                  type="submit"
                  disabled={submitting || !acceptedTerms}
                  className="flex-1 py-3 px-5 text-sm font-semibold rounded-md bg-[#6c0cf0] hover:bg-[#5809c7] text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2 shadow-sm"
                >
                  {submitting ? "Registrando…" : "Autorizar Entrada do Menor"}
                  <ArrowRight className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => {
                    if (confirm(`Tem certeza que deseja recusar a entrada de ${data.holderName} no evento?`)) {
                      handleDecision("reject");
                    }
                  }}
                  className="py-3 px-4 text-sm font-medium rounded-md border border-neutral-300 text-neutral-700 hover:bg-neutral-50 hover:text-red-600 transition-colors cursor-pointer"
                >
                  Recusar Autorização
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Footer */}
        <footer className="border-t border-neutral-200 pt-6 text-center text-xs text-neutral-500 space-y-1">
          <p>Plataforma PRX · Conformidade com a Lei nº 8.069/1990 (Estatuto da Criança e do Adolescente) e LGPD.</p>
          <p>Dúvidas ou suporte? Entre em contato pelo e-mail oficial da PRX.</p>
        </footer>
      </div>
    </main>
  );
}
