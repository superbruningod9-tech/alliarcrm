import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import {
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  Send,
  Sparkles,
  MessageSquare,
  ArrowRight,
  User,
  Copy,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { seo } from "@/lib/seo";
import { supabase } from "@/integrations/supabase/client";
import { toE164 } from "@/lib/whatsapp";
import { executeWelcomeAutomation, loadAutomationSettings } from "@/lib/alliar-modules";

export const Route = createFileRoute("/formulario")({
  validateSearch: (s: Record<string, unknown>) => ({
    t: typeof s["t"] === "string" ? s["t"] : undefined,
    slug: typeof s["slug"] === "string" ? s["slug"] : undefined,
    vendedor: typeof s["vendedor"] === "string" ? s["vendedor"] : undefined,
    whatsapp: typeof s["whatsapp"] === "string" ? s["whatsapp"] : undefined,
    msg: typeof s["msg"] === "string" ? s["msg"] : undefined,
  }),
  head: () =>
    seo(
      "Questionário Comercial · Alliar",
      "Responda a algumas perguntas rápidas para receber uma proposta personalizada."
    ),
  component: PublicFormPage,
});

interface Question {
  id: string;
  title: string;
  subtitle: string;
  type: "text" | "tel" | "email" | "select" | "textarea";
  options?: string[];
  placeholder?: string;
  required?: boolean;
}

const DEFAULT_QUESTIONS: Question[] = [
  {
    id: "nome",
    title: "Como podemos te chamar?",
    subtitle: "Digite seu nome completo ou o nome da sua empresa.",
    type: "text",
    placeholder: "Ex: João Silva ou Clínica Sorriso",
    required: true,
  },
  {
    id: "whatsapp",
    title: "Qual o seu WhatsApp comercial?",
    subtitle: "Enviaremos o resumo e a proposta diretamente por lá.",
    type: "tel",
    placeholder: "(11) 98765-4321",
    required: true,
  },
  {
    id: "email",
    title: "Qual o seu melhor e-mail?",
    subtitle: "Para documentação e envio de materiais exclusivos.",
    type: "email",
    placeholder: "seu@email.com",
    required: true,
  },
  {
    id: "segmento",
    title: "Qual o segmento da sua empresa?",
    subtitle: "Selecione a área principal de atuação do seu negócio.",
    type: "select",
    options: [
      "Saúde, Clínicas & Odontologia",
      "Comércio, Varejo & E-commerce",
      "Tecnologia, SaaS & Startups",
      "Serviços, Advocacia & Consultoria",
      "Indústria, Construção & Outros",
    ],
    required: true,
  },
  {
    id: "faturamento",
    title: "Qual a média de faturamento mensal?",
    subtitle: "Isso nos ajuda a desenhar a melhor solução para o seu momento.",
    type: "select",
    options: [
      "Até R$ 20.000 / mês",
      "R$ 20.000 a R$ 100.000 / mês",
      "R$ 100.000 a R$ 500.000 / mês",
      "Acima de R$ 500.000 / mês",
    ],
    required: true,
  },
  {
    id: "desafio",
    title: "Qual o seu maior desafio em vendas hoje?",
    subtitle: "Conte um pouco sobre suas metas ou o que gostaria de acelerar.",
    type: "textarea",
    placeholder: "Ex: Precisamos captar mais clientes qualificados e diminuir o tempo de resposta no WhatsApp...",
    required: false,
  },
];

function PublicFormPage() {
  const {
    t: tenantQuery,
    vendedor: queryVendedor,
    whatsapp: queryWhatsapp,
    msg: queryMsg,
  } = Route.useSearch();

  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const q = DEFAULT_QUESTIONS[currentStep] || DEFAULT_QUESTIONS[0]!;
  const total = DEFAULT_QUESTIONS.length;
  const progress = Math.round(((currentStep + 1) / total) * 100);

  // Configurações do Vendedor carregadas via search param ou tenant settings
  const companySettings = loadAutomationSettings(tenantQuery || "");
  const sellerName = queryVendedor || "Consultor Especialista";
  const sellerPhone = queryWhatsapp || companySettings.whatsappNumber || "5511999999999";
  const cleanSellerPhone = toE164(sellerPhone);

  const defaultMsgTemplate =
    queryMsg ||
    "Olá, {{vendedor}}! Acabei de responder ao questionário de qualificação da {{empresa}} (meu nome é {{cliente}}). Gostaria de agilizar meu atendimento e receber a proposta!";

  function handleAnswer(val: string) {
    setAnswers((prev) => ({ ...prev, [q.id]: val }));
    setErrorMsg("");
  }

  function handleNext() {
    const currentVal = (answers[q.id] || "").trim();
    if (q.required && !currentVal) {
      setErrorMsg("Por favor, preencha este campo para continuar.");
      return;
    }

    if (q.type === "tel" && currentVal.replace(/\D/g, "").length < 10) {
      setErrorMsg("Por favor, informe um WhatsApp válido com DDD.");
      return;
    }

    if (currentStep < total - 1) {
      setCurrentStep((prev) => prev + 1);
      setErrorMsg("");
    } else {
      void handleSubmit();
    }
  }

  function handlePrev() {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
      setErrorMsg("");
    }
  }

  async function handleSubmit() {
    setBusy(true);
    setErrorMsg("");

    const name = answers["nome"] || "Lead Questionário";
    const phone = answers["whatsapp"] || "";
    const email = answers["email"] || "";
    const segmento = answers["segmento"] || "Comercial";
    const faturamento = answers["faturamento"] || "";

    const tenantId = tenantQuery || "default";

    try {
      // 1. Tenta criar lead via RPC create_lead
      try {
        const { data: newId, error } = await supabase.rpc("create_lead", {
          t: tenantId,
          contact_name: name,
          contact_company: segmento,
          contact_phone: phone,
          contact_email: email,
          deal_value: faturamento.includes("500.000") ? 50000 : faturamento.includes("100.000") ? 25000 : 10000,
        });

        if (!error && newId) {
          // Grava respostas na timeline do lead
          const textAnswers = Object.entries(answers)
            .map(([k, v]) => `• ${k.toUpperCase()}: ${v}`)
            .join("\n");

          await supabase.from("lead_events").insert({
            tenant_id: tenantId,
            lead_id: newId,
            kind: "nota",
            text: `📋 [Questionário de Qualificação Preenchido]\nConsultor Responsável: ${sellerName}\n${textAnswers}`,
          });

          // Dispara automação de boas-vindas se habilitada
          void executeWelcomeAutomation({
            tenantId,
            leadId: newId,
            leadName: name,
            leadPhone: phone,
            companyName: segmento,
            sellerName,
          });
        }
      } catch (err) {
        console.warn("RPC create_lead fallback:", err);
      }

      setSubmitted(true);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Não foi possível enviar o formulário.");
    } finally {
      setBusy(false);
    }
  }

  // Monta a mensagem personalizada substituindo as tags
  const compiledWhatsAppMessage = useMemo(() => {
    return defaultMsgTemplate
      .replace(/\{\{vendedor\}\}/gi, sellerName)
      .replace(/\{\{cliente\}\}/gi, answers["nome"] || "Cliente")
      .replace(/\{\{empresa\}\}/gi, answers["segmento"] || "minha empresa")
      .replace(/\{\{faturamento\}\}/gi, answers["faturamento"] || "");
  }, [defaultMsgTemplate, sellerName, answers]);

  return (
    <div className="min-h-screen bg-[#F7F3EB] text-[#2B2520] flex flex-col justify-between">
      {/* Barra de Progresso no Topo */}
      <div className="w-full bg-[#E0D5C3]/60 h-1.5">
        <div
          className="bg-[#C25E38] h-1.5 transition-all duration-300 ease-out"
          style={{ width: `${submitted ? 100 : progress}%` }}
        />
      </div>

      {/* Conteúdo Principal */}
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-xl space-y-6">
          
          {/* Logo / Header com identificação do consultor */}
          <div className="text-center space-y-2">
            <span className="text-[#C25E38] text-xs font-black tracking-widest uppercase">
              [ALLIAR CRM]
            </span>
            <div className="flex items-center justify-center gap-1.5 text-xs text-[#7A6F62]">
              <User className="size-3.5 text-[#C25E38]" />
              <span>Consultor Responsável: <strong className="text-[#2B2520]">{sellerName}</strong></span>
            </div>
          </div>

          {!submitted ? (
            <div className="rounded-3xl border border-[#E0D5C3] bg-[#FFFDF9] p-6 sm:p-8 shadow-md space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              {/* Cabeçalho da Pergunta */}
              <div className="space-y-1.5">
                <span className="text-xs font-bold text-[#C25E38]">
                  Pergunta {currentStep + 1} de {total}
                </span>
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#2B2520]">{q.title}</h1>
                <p className="text-sm text-[#7A6F62]">{q.subtitle}</p>
              </div>

              {/* Input da Pergunta */}
              <div className="pt-2">
                {q.type === "select" ? (
                  <div className="grid gap-2.5 sm:grid-cols-1">
                    {q.options?.map((opt) => {
                      const isSelected = answers[q.id] === opt;
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => {
                            handleAnswer(opt);
                            setTimeout(() => handleNext(), 150);
                          }}
                          className={`flex items-center justify-between p-4 rounded-xl border text-left text-sm font-semibold transition-all cursor-pointer ${
                            isSelected
                              ? "border-[#C25E38] bg-[#C25E38]/10 text-[#C25E38] shadow-xs"
                              : "border-[#E0D5C3] bg-[#FBF9F5] hover:border-[#C25E38]/50 hover:bg-[#F7F3EB] text-[#2B2520]"
                          }`}
                        >
                          <span>{opt}</span>
                          <ChevronRight className="size-4 text-[#8C8072]" />
                        </button>
                      );
                    })}
                  </div>
                ) : q.type === "textarea" ? (
                  <Textarea
                    rows={4}
                    value={answers[q.id] || ""}
                    onChange={(e) => handleAnswer(e.target.value)}
                    placeholder={q.placeholder}
                    className="text-sm rounded-xl bg-[#FBF9F5] border-[#E0D5C3] focus:border-[#C25E38] focus:ring-[#C25E38]/20"
                    autoFocus
                  />
                ) : (
                  <Input
                    type={q.type}
                    value={answers[q.id] || ""}
                    onChange={(e) => handleAnswer(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleNext();
                      }
                    }}
                    placeholder={q.placeholder}
                    className="h-12 text-sm px-4 rounded-xl bg-[#FBF9F5] border-[#E0D5C3] focus:border-[#C25E38] focus:ring-[#C25E38]/20 font-medium"
                    autoFocus
                  />
                )}

                {errorMsg && <p className="text-xs text-destructive mt-2 font-medium">{errorMsg}</p>}
              </div>

              {/* Botões de Ação */}
              <div className="flex items-center justify-between pt-4 border-t border-[#EAE2D5]">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handlePrev}
                  disabled={currentStep === 0 || busy}
                  className="text-xs text-[#7A6F62] hover:text-[#2B2520]"
                >
                  <ChevronLeft className="mr-1 size-3.5" /> Voltar
                </Button>

                <button
                  type="button"
                  onClick={handleNext}
                  disabled={busy}
                  className="rounded-xl px-6 h-10 text-xs font-bold text-white bg-[#C25E38] hover:bg-[#A84F2E] transition-all shadow-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {busy ? (
                    "Enviando…"
                  ) : currentStep === total - 1 ? (
                    <>
                      <Send className="size-3.5" /> Finalizar e Enviar
                    </>
                  ) : (
                    <>
                      Continuar <ArrowRight className="size-3.5" />
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            /* Tela de Conclusão e Sucesso com Disparo do WhatsApp do Vendedor */
            <div className="rounded-3xl border border-[#E0D5C3] bg-[#FFFDF9] p-8 text-center space-y-6 shadow-md animate-in zoom-in-95 duration-300">
              <div className="flex justify-center">
                <div className="flex size-16 items-center justify-center rounded-2xl bg-[#166534]/10 text-[#166534]">
                  <CheckCircle2 className="size-8 text-[#166534]" />
                </div>
              </div>

              <div className="space-y-2">
                <h2 className="text-2xl font-black text-[#2B2520]">Respostas Enviadas com Sucesso!</h2>
                <p className="text-sm text-[#7A6F62] max-w-md mx-auto">
                  Muito obrigado, <strong className="text-[#2B2520]">{answers["nome"]}</strong>! O consultor{' '}
                  <strong className="text-[#C25E38]">{sellerName}</strong> já recebeu seus dados de qualificação.
                </p>
              </div>

              {/* Prévia da Mensagem Automática de WhatsApp */}
              <div className="rounded-2xl border border-[#E0D5C3] bg-[#F7F3EB] p-4 text-left space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-[#554D43] flex items-center gap-1.5">
                    <MessageSquare className="size-3.5 text-emerald-600" /> Mensagem pronta para o WhatsApp:
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard.writeText(compiledWhatsAppMessage);
                      toast.success("Mensagem copiada!");
                    }}
                    className="text-[11px] font-semibold text-[#C25E38] hover:underline flex items-center gap-1"
                  >
                    <Copy className="size-3" /> Copiar
                  </button>
                </div>
                <p className="text-xs text-[#2B2520] font-medium bg-[#FFFDF9] p-3 rounded-xl border border-[#E0D5C3] leading-relaxed italic">
                  "{compiledWhatsAppMessage}"
                </p>
                <p className="text-[11px] text-[#7A6F62]">
                  Destinatário: <strong>{sellerName}</strong> ({sellerPhone})
                </p>
              </div>

              {/* Botão de Disparo Direto para o WhatsApp */}
              <div className="pt-2">
                <a
                  href={`https://wa.me/${cleanSellerPhone}?text=${encodeURIComponent(compiledWhatsAppMessage)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl py-3.5 px-6 font-bold text-sm text-white bg-emerald-600 hover:bg-emerald-700 shadow-md shadow-emerald-700/20 transition-all cursor-pointer"
                >
                  <MessageSquare className="size-4" /> Enviar Mensagem para {sellerName} no WhatsApp
                </a>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Rodapé */}
      <footer className="text-center py-4 text-xs text-[#8C8072]">
        Powered by <strong className="text-[#2B2520]">[ALLIAR CRM]</strong> · Vendas WhatsApp-First
      </footer>
    </div>
  );
}
