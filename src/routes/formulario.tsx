import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { CheckCircle2, ChevronRight, ChevronLeft, Send, Sparkles, MessageSquare, ArrowRight } from "lucide-react";
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
  const { t: tenantQuery } = Route.useSearch();
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const q = DEFAULT_QUESTIONS[currentStep] || DEFAULT_QUESTIONS[0]!;
  const total = DEFAULT_QUESTIONS.length;
  const progress = Math.round(((currentStep + 1) / total) * 100);

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
    const desafio = answers["desafio"] || "";

    const tenantId = tenantQuery || "default";

    try {
      // 1. Tenta criar lead via RPC create_lead
      let leadId = "";
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
          leadId = newId;

          // Grava respostas na timeline do lead
          const textAnswers = Object.entries(answers)
            .map(([k, v]) => `• ${k.toUpperCase()}: ${v}`)
            .join("\n");

          await supabase.from("lead_events").insert({
            tenant_id: tenantId,
            lead_id: newId,
            kind: "nota",
            text: `📋 [Questionário de Qualificação Preenchido]\n${textAnswers}`,
          });

          // Dispara automação de boas-vindas se habilitada
          void executeWelcomeAutomation({
            tenantId,
            leadId: newId,
            leadName: name,
            leadPhone: phone,
            companyName: segmento,
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

  const companySettings = loadAutomationSettings(tenantQuery || "");
  const companyPhone = companySettings.whatsappNumber || "5511999999999";
  const cleanCompanyPhone = toE164(companyPhone);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-between">
      {/* Barra de Progresso no Topo */}
      <div className="w-full bg-muted/40 h-1.5">
        <div
          className="bg-primary h-1.5 transition-all duration-300 ease-out"
          style={{ width: `${submitted ? 100 : progress}%` }}
        />
      </div>

      {/* Conteúdo Principal */}
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-xl space-y-8">
          {/* Logo / Header */}
          <div className="text-center space-y-1">
            <span className="text-primary text-xs font-bold tracking-wider uppercase">ALLIAR CRM</span>
            <p className="text-xs text-muted-foreground">Diagnóstico & Qualificação Comercial</p>
          </div>

          {!submitted ? (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-3 duration-300">
              {/* Cabeçalho da Pergunta */}
              <div className="space-y-2">
                <span className="text-xs font-semibold text-primary/80">
                  Pergunta {currentStep + 1} de {total}
                </span>
                <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">{q.title}</h1>
                <p className="text-sm text-muted-foreground">{q.subtitle}</p>
              </div>

              {/* Input da Pergunta */}
              <div className="pt-2">
                {q.type === "select" ? (
                  <div className="grid gap-2 sm:grid-cols-1">
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
                          className={`flex items-center justify-between p-4 rounded-xl border text-left text-sm font-medium transition-all ${
                            isSelected
                              ? "border-primary bg-primary/10 text-primary shadow-sm"
                              : "border-input bg-card hover:border-primary/50 hover:bg-muted/50"
                          }`}
                        >
                          <span>{opt}</span>
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
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
                    className="text-base"
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
                    className="h-12 text-base px-4 rounded-xl"
                    autoFocus
                  />
                )}

                {errorMsg && <p className="text-xs text-destructive mt-2">{errorMsg}</p>}
              </div>

              {/* Botões de Ação */}
              <div className="flex items-center justify-between pt-4">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handlePrev}
                  disabled={currentStep === 0 || busy}
                  className="text-xs"
                >
                  <ChevronLeft className="mr-1 h-3.5 w-3.5" /> Voltar
                </Button>

                <Button type="button" onClick={handleNext} disabled={busy} className="rounded-xl px-6">
                  {busy ? (
                    "Enviando…"
                  ) : currentStep === total - 1 ? (
                    <>
                      <Send className="mr-1.5 h-4 w-4" /> Finalizar e Enviar
                    </>
                  ) : (
                    <>
                      Continuar <ArrowRight className="ml-1.5 h-4 w-4" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          ) : (
            /* Tela de Conclusão e Sucesso */
            <div className="rounded-2xl border bg-card p-8 text-center space-y-6 shadow-sm animate-in zoom-in-95 duration-300">
              <div className="flex justify-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10 text-green-500">
                  <CheckCircle2 className="h-8 w-8" />
                </div>
              </div>

              <div className="space-y-2">
                <h2 className="text-2xl font-bold">Respostas Enviadas com Sucesso!</h2>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  Muito obrigado, <span className="font-semibold text-foreground">{answers["nome"]}</span>! Nossos
                  especialistas já receberam seus dados e estão montando uma proposta sob medida.
                </p>
              </div>

              <div className="rounded-xl border bg-muted/30 p-4 text-xs text-muted-foreground space-y-1">
                <p>
                  ✅ WhatsApp de contato registrado: <strong className="text-foreground">{answers["whatsapp"]}</strong>
                </p>
                <p>✅ Encaminhado para a fila de atendimento prioritário.</p>
              </div>

              <div className="pt-2">
                <Button asChild className="w-full sm:w-auto px-8 rounded-xl bg-green-600 hover:bg-green-700 text-white">
                  <a
                    href={`https://wa.me/${cleanCompanyPhone}?text=${encodeURIComponent(
                      `Olá! Acabei de responder ao questionário de qualificação da Alliar (Nome: ${answers["nome"]}). Gostaria de agilizar meu atendimento!`
                    )}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <MessageSquare className="mr-2 h-4 w-4" /> Chamar Consultor no WhatsApp
                  </a>
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Rodapé Simples */}
      <footer className="text-center py-4 text-xs text-muted-foreground">
        Powered by <span className="font-semibold text-foreground">Alliar CRM</span> · Vendas WhatsApp-First
      </footer>
    </div>
  );
}
