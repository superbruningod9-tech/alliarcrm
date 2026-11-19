import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Award, Loader2, Send, CheckCircle2, XCircle, RotateCcw,
  Sparkles, HelpCircle, Bot, ChevronRight, Users, Zap,
  MessageCircle, TrendingUp, Shield, Clock,
} from "lucide-react";
import { toast } from "sonner";
import { seo } from "@/lib/seo";
import { cn } from "@/lib/utils";
import { aiAssist } from "@/lib/ai.functions";
import { PageHeader } from "@/components/alliar/Shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/treino")({
  head: () =>
    seo(
      "Treino & Capacitação Comercial · Alliar CRM",
      "Simulador avançado de vendas com IA — 8 personas reais de clientes, certificação e negociação B2B."
    ),
  component: Train,
});

// ============================================================
// PERSONAS EXPANDIDAS (ETAPA 5) — 8 perfis realistas de clientes
// ============================================================
const PERSONAS = {
  Pechincheiro: {
    icon: "💰",
    label: "O Pechincheiro",
    open: "Tá caro demais. O concorrente faz pela metade do preço e ainda dá brinde.",
    desc: "Dono de pequena empresa extremamente focado em preço. Pede desconto antes mesmo de entender o produto. Compara com concorrentes sempre. Desafio: vender valor sem queimar margem.",
    difficulty: "Médio",
    diffColor: "text-amber-500",
    tip: "Use a técnica de ancoragem de ROI: calcule com ele quanto o problema atual custa por mês antes de falar de preço.",
    category: "Objeção de Preço",
  },
  Desconfiado: {
    icon: "🔍",
    label: "O Desconfiado",
    open: "Nunca ouvi falar de vocês. Já fui enganado por uma empresa assim antes. Me dê motivos para confiar.",
    desc: "Cliente cético e cauteloso, teve experiências negativas com fornecedores. Pede referências, provas sociais e garantias concretas. Desafio: construir credibilidade rapidamente.",
    difficulty: "Difícil",
    diffColor: "text-red-500",
    tip: "Ofereça provas sociais concretas: cases reais, depoimentos de clientes do mesmo segmento, garantia por escrito.",
    category: "Credibilidade",
  },
  Apressado: {
    icon: "⚡",
    label: "O Executivo Sem Tempo",
    open: "Tenho exatamente 2 minutos. Vai direto ao ponto: o que vocês fazem e por que eu deveria me importar?",
    desc: "Executivo de alto nível extremamente ocupado. Sem paciência para apresentações longas. Quer dados, números e benefícios diretos. Desafio: fazer o pitch em menos de 90 segundos.",
    difficulty: "Difícil",
    diffColor: "text-red-500",
    tip: "Use a estrutura: Problema → Solução → Resultado em números. Máximo 3 frases antes de fazer uma pergunta.",
    category: "Pitch Rápido",
  },
  Comparador: {
    icon: "📊",
    label: "O Comparador de Planilha",
    open: "Estou avaliando 5 fornecedores. Me mande uma planilha comparativa com todos os seus concorrentes, incluindo preços e funcionalidades.",
    desc: "Comprador racional e analítico. Criou uma planilha de comparação e está em processo formal de RFP/cotação. Avalia tudo por critérios técnicos. Desafio: diferenciar-se da concorrência sem entrar em guerra de preço.",
    difficulty: "Médio",
    diffColor: "text-amber-500",
    tip: "Foque nos critérios que você vence: suporte em português, tempo de resposta no WhatsApp, integração com PIX. Não dispute os critérios que você perde.",
    category: "Concorrência",
  },
  Indeciso: {
    icon: "🤔",
    label: "O Eterno Indeciso",
    open: "Achei interessante. Vou pensar mais um pouco e te retorno semana que vem... ou talvez no mês que vem.",
    desc: "Cliente que demonstra interesse mas não avança. Fica postergando a decisão com desculpas. Pode estar com medo de errar ou falta de urgência. Desafio: criar urgência real sem pressão agressiva.",
    difficulty: "Médio",
    diffColor: "text-amber-500",
    tip: "Pergunte: 'O que faria você tomar a decisão hoje?' Descubra o obstáculo real. Ofereça uma garantia para reduzir o risco percebido.",
    category: "Urgência e Decisão",
  },
  DecidorB2B: {
    icon: "🏢",
    label: "Decisor B2B Corporativo",
    open: "Preciso apresentar isso ao conselho antes de qualquer aprovação. Quais documentos vocês têm? Preciso de proposta formal, NDA e referências de empresas do mesmo porte.",
    desc: "Gestor de médias/grandes empresas que precisa justificar a compra para superiores. Processo de compra formal com múltiplos aprovadores. Desafio: vender tanto para o contato quanto para o comitê que ele vai apresentar.",
    difficulty: "Avançado",
    diffColor: "text-purple-500",
    tip: "Ajude-o a montar o business case interno: prepare material pronto para ele apresentar ao conselho, com ROI, casos de uso e payback.",
    category: "Venda Corporativa B2B",
  },
  ClienteAntigoCancelando: {
    icon: "🚨",
    label: "Cliente Antigo Cancelando",
    open: "Olha, estou pensando em cancelar. Encontrei uma opção mais barata e honestamente não senti que vocês valorizaram minha conta nesses últimos meses.",
    desc: "Cliente de longa data que está considerando churnar. Sente-se desvalorizado ou encontrou concorrente mais barato. Momento crítico de retenção. Desafio: salvar o cliente sem prejudicar margens.",
    difficulty: "Avançado",
    diffColor: "text-purple-500",
    tip: "Escute primeiro sem defender. Reconheça a falha, ofereça uma solução concreta (não apenas desconto) e demonstre que a conta dele é estratégica para você.",
    category: "Retenção e Churn",
  },
  TecnicoExigente: {
    icon: "🔧",
    label: "O Técnico Exigente",
    open: "Antes de seguir em frente, preciso entender a arquitetura técnica de vocês. Quais APIs vocês têm? A plataforma é SaaS ou on-premise? E sobre LGPD e segurança de dados?",
    desc: "CTO, desenvolvedor ou gestor de TI que precisa entender a fundo a solução técnica. Vai perguntar sobre APIs, segurança, uptime, integrações e conformidade regulatória. Desafio: responder tecnicamente e ao mesmo tempo reconectar ao valor de negócio.",
    difficulty: "Avançado",
    diffColor: "text-purple-500",
    tip: "Responda o técnico com competência e depois faça a ponte: 'Isso resolve o problema técnico. Mas o impacto no negócio é ainda maior porque...'",
    category: "Venda Técnica",
  },
} as const;

type P = keyof typeof PERSONAS;
type M = { me: boolean; t: string };
const ROUNDS = 5; // Aumentado de 4 para 5 rodadas

// ============================================================
// BANCO DE QUESTÕES EXPANDIDO — 10 questões (Etapa 5)
// ============================================================
interface QuizQuestion {
  question: string;
  options: string[];
  correct: number;
  explanation: string;
  category: string;
}

const QUIZ_QUESTIONS: QuizQuestion[] = [
  {
    category: "Velocidade de Resposta",
    question: "1. Um lead novo enviou mensagem às 14h00 pelo formulário público. Pela Regra dos 5 Minutos, o que acontece se nenhum vendedor responder em 5 minutos?",
    options: [
      "O lead é descartado automaticamente do sistema.",
      "Um alerta sonoro dispara e o lead é redistribuído para o próximo vendedor disponível na fila Anti-Vácuo.",
      "O sistema espera 2 horas antes de qualquer ação.",
      "Um e-mail automático é enviado apenas para o gestor.",
    ],
    correct: 1,
    explanation: "A Regra Anti-Vácuo do Alliar detecta leads sem resposta em 5 minutos, dispara o bipe de alerta e redistribui automaticamente para o próximo vendedor da equipe. Leads respondidos em até 5 minutos têm 21x mais chance de qualificação.",
  },
  {
    category: "Objeção de Preço",
    question: "2. O cliente diz no WhatsApp: 'Gostei muito, mas o preço está 30% acima do que eu esperava pagar'. Qual resposta de um vendedor consultivo B2B é mais eficaz?",
    options: [
      "Dar 30% de desconto imediatamente para fechar a venda no mesmo dia.",
      "Dizer que o preço é fixo e que o cliente deveria reconsiderar suas prioridades.",
      "Ancoragem no ROI: 'Entendo. Me conta: qual é o impacto financeiro que esse problema gera no seu negócio hoje por mês? Assim consigo mostrar o retorno exato do investimento.'",
      "Encerrar a conversa e focar em outros leads mais quentes.",
    ],
    correct: 2,
    explanation: "Em vendas B2B consultivas, a objeção de preço quase sempre esconde uma dúvida sobre o retorno. Ancorando a conversa no custo atual do problema, você reconstrói o valor antes de negociar qualquer número — sem queimar sua margem.",
  },
  {
    category: "Fechamento e PIX",
    question: "3. O cliente acabou de dizer 'Ok, pode fazer!' e deu o aceite verbal na proposta. Qual é o próximo passo imediato do vendedor no Alliar CRM?",
    options: [
      "Pedir que o cliente assine um contrato físico e aguardar o retorno pelo correio.",
      "Gerar o PIX em 1 clique dentro do CRM e enviá-lo imediatamente pelo WhatsApp enquanto o cliente está no momento de maior intenção de compra.",
      "Aguardar até o próximo dia útil para enviar o boleto por e-mail.",
      "Marcar uma nova reunião para apresentar a proposta novamente com mais detalhes.",
    ],
    correct: 1,
    explanation: "O momento de maior intenção de compra é logo após o 'sim'. O PIX em 1 clique do Alliar permite converter o aceite verbal em pagamento confirmado em segundos, eliminando o risco de o cliente 'esfriar' até o próximo dia.",
  },
  {
    category: "Follow-Up e Reengajamento",
    question: "4. Um lead qualificado não responde após 24 horas da primeira abordagem. Qual sequência de follow-up é mais eficaz segundo as melhores práticas de vendas?",
    options: [
      "Ligar 10 vezes seguidas e enviar mensagens a cada hora até obter resposta.",
      "Descartar o lead e marcá-lo como perdido imediatamente.",
      "Enviar uma mensagem com pergunta aberta que gere valor ('Vi que você é do segmento X — você já calculou quanto custa Y por mês para você?') e agendar novo contato em 48h.",
      "Esperar 30 dias em silêncio antes de tentar qualquer contato.",
    ],
    correct: 2,
    explanation: "O follow-up eficaz não repete o mesmo pitch — adiciona valor. Uma pergunta que conecta com a dor do cliente desperta o engajamento sem soar invasivo. A cadência ideal é: Dia 1, Dia 3, Dia 7, Dia 14, Dia 30.",
  },
  {
    category: "Proposta Comercial",
    question: "5. Ao enviar a proposta comercial pelo WhatsApp, qual combinação de elementos aumenta mais a taxa de leitura e resposta?",
    options: [
      "Apenas um PDF de 40 páginas sem mensagem de texto, para parecer mais profissional.",
      "Uma mensagem de áudio ou texto de 3 linhas destacando os 2 principais benefícios + link rastreável da proposta + pergunta de fechamento como CTA.",
      "Nenhuma mensagem — só o link do PDF para o cliente descobrir por conta própria.",
      "Enviar apenas o valor final sem nenhuma contextualização do que está incluso.",
    ],
    correct: 1,
    explanation: "Propostas com mensagem de contextualização focada em benefícios (não em features) têm taxa de abertura acima de 85%. O link rastreável permite saber exatamente quando o cliente abriu — perfeito para ligar na hora certa.",
  },
  {
    category: "Qualificação SPIN",
    question: "6. No método SPIN Selling, qual tipo de pergunta é mais poderosa para criar urgência de compra no cliente B2B?",
    options: [
      "Perguntas de Situação: 'Quantos funcionários vocês têm?' e 'Qual CRM vocês usam hoje?'",
      "Perguntas de Problema: 'Vocês têm dificuldade em responder leads rapidamente?'",
      "Perguntas de Implicação: 'Se vocês continuarem perdendo X leads por mês por demora no atendimento, qual será o impacto no faturamento nos próximos 6 meses?'",
      "Perguntas de Necessidade de Solução: 'O que aconteceria se vocês conseguissem responder todos os leads em menos de 5 minutos?'",
    ],
    correct: 2,
    explanation: "As Perguntas de Implicação são o coração do SPIN Selling — elas transformam um problema vago em dor financeira concreta e urgente. Quando o cliente verbaliza o custo do problema, ele se convence da necessidade da solução antes mesmo de você apresentá-la.",
  },
  {
    category: "Retenção e Churn",
    question: "7. Um cliente de 2 anos ameaça cancelar porque encontrou um concorrente 20% mais barato. Qual é a abordagem mais eficaz para retê-lo?",
    options: [
      "Dar 20% de desconto imediatamente para igualar o preço do concorrente.",
      "Dizer que o concorrente é inferior e que o cliente vai se arrepender.",
      "Escutar sem interromper, reconhecer a situação, descobrir o motivo real por trás do preço (insatisfação? dificuldade financeira?), e apresentar uma solução customizada que pode incluir ajuste de plano, bônus de fidelidade ou onboarding adicional.",
      "Aceitar o cancelamento educadamente e focar em novos clientes.",
    ],
    correct: 2,
    explanation: "O churn raro é só sobre preço — normalmente há uma insatisfação latente. Escutar ativamente e descobrir o problema real (falta de suporte? não usa todos os recursos?) permite oferecer uma solução de retenção mais eficaz e menos custosa do que um desconto puro.",
  },
  {
    category: "Negociação B2B",
    question: "8. Em uma negociação B2B corporativa onde o comprador pede desconto mas você não quer ceder em preço, qual técnica preserva a margem e mantém o relacionamento?",
    options: [
      "Recusar qualquer negociação e dizer que o preço é fixo sem exceções.",
      "Dar o desconto pedido e compensar com entrega de menos valor no contrato.",
      "Usar a técnica 'se-então': 'Se vocês aumentarem o volume de licenças para 20, então consigo reduzir o valor unitário em 10%. Se vocês pagarem à vista, adiciono 3 meses de suporte premium.'",
      "Encerrar a negociação e ligar novamente em 3 meses.",
    ],
    correct: 2,
    explanation: "A técnica 'se-então' protege sua margem ao transformar o desconto em uma troca de valor — você só concede quando recebe algo em troca (volume, prazo, referência, caso de sucesso). Nunca conceda sem contrapartida em negociações B2B.",
  },
  {
    category: "WhatsApp Comercial",
    question: "9. Qual das práticas abaixo está em conformidade com a política da Meta e aumenta a taxa de resposta no WhatsApp Business?",
    options: [
      "Enviar mensagens de texto genéricas sem personalização para toda a lista de contatos ao mesmo tempo.",
      "Usar templates aprovados pela Meta para o primeiro contato após 24h de silêncio, personalizando nome, empresa e dor específica do segmento.",
      "Ligar para o cliente e, sem autorização, adicionar ao grupo de WhatsApp da empresa.",
      "Enviar áudios de 10 minutos explicando todos os recursos do produto de uma só vez.",
    ],
    correct: 1,
    explanation: "A Meta exige templates aprovados para mensagens iniciadas pela empresa após 24h sem resposta do cliente. Templates personalizados com nome e dor específica do segmento têm taxa de resposta 3x maior que mensagens genéricas, e evitam bloqueio da conta.",
  },
  {
    category: "Passagem de Bastão SDR → Closer",
    question: "10. Um SDR (pré-vendedor) qualificou um lead como 'SQL' (Sales Qualified Lead) e precisa fazer a passagem para o closer. Qual procedimento minimiza a perda de contexto e aumenta a taxa de fechamento?",
    options: [
      "Dar apenas o nome e telefone do lead para o closer ligar sem contexto.",
      "Enviar um briefing interno com: nome do decisor, dor principal, orçamento estimado, timeline de compra, objeções levantadas e os 3 próximos passos acordados com o cliente.",
      "Pedir que o lead recomeça tudo do zero com o closer sem nenhuma informação prévia.",
      "Enviar todos os 200 e-mails trocados sem nenhum resumo ou priorização.",
    ],
    correct: 1,
    explanation: "A passagem de bastão com briefing estruturado (CRM handoff) reduz em até 60% o tempo de onboarding do closer com o lead e evita que o cliente repita sua história — o que gera frustração e aumenta o risco de churn antes mesmo do fechamento.",
  },
];

function Train() {
  const [tab, setTab] = useState<"roleplay" | "quiz">("quiz");

  // ── Roleplay com IA ──
  const ai = useServerFn(aiAssist);
  const [p, setP] = useState<P>("Pechincheiro");
  const [msgs, setMsgs] = useState<M[]>([{ me: false, t: PERSONAS.Pechincheiro.open }]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  const mine = msgs.filter((m) => m.me).length;

  const history = (list: M[]) =>
    list.map((m) => ({ role: (m.me ? "user" : "assistant") as "user" | "assistant", content: m.t }));

  const start = (np: P) => {
    setP(np);
    setResult("");
    setMsgs([{ me: false, t: PERSONAS[np].open }]);
  };

  const send = async () => {
    if (!text.trim() || busy || result) return;
    const n = [...msgs, { me: true, t: text.trim() }];
    setMsgs(n);
    setText("");
    setBusy(true);
    try {
      if (n.filter((m) => m.me).length >= ROUNDS) {
        const r = await ai({
          data: {
            task: "grade",
            context: `Persona: ${PERSONAS[p].desc}\nCategoria de treinamento: ${PERSONAS[p].category}\nDica para esta persona: ${PERSONAS[p].tip}`,
            messages: [{ role: "user", content: n.map((m) => `${m.me ? "VENDEDOR" : "CLIENTE"}: ${m.t}`).join("\n") }],
          },
        });
        if (r.error) toast.error(r.error);
        else setResult(r.text);
      } else {
        const r = await ai({
          data: {
            task: "roleplay",
            context: `${PERSONAS[p].desc}\nCategoria: ${PERSONAS[p].category}`,
            messages: history(n).map((m) => ({ ...m, role: m.role === "user" ? "user" : "assistant" })),
          },
        });
        if (r.error) toast.error(r.error);
        else setMsgs([...n, { me: false, t: r.text }]);
      }
    } finally {
      setBusy(false);
    }
  };

  const score = Number(result.match(/NOTA:\s*(\d+)/i)?.[1] ?? NaN);

  // ── Questionário de Certificação ──
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  // Permite filtrar por categoria de questão
  const allCategories = Array.from(new Set(QUIZ_QUESTIONS.map((q) => q.category)));
  const filteredQuestions = selectedCategories.length > 0
    ? QUIZ_QUESTIONS.filter((q) => selectedCategories.includes(q.category))
    : QUIZ_QUESTIONS;

  function handleSelectOption(qIdx: number, optIdx: number) {
    if (quizSubmitted) return;
    setAnswers((prev) => ({ ...prev, [qIdx]: optIdx }));
  }

  function handleFinishQuiz() {
    if (Object.keys(answers).length < filteredQuestions.length) {
      toast.warning(`Por favor, responda a todas as ${filteredQuestions.length} perguntas antes de finalizar.`);
      return;
    }
    setQuizSubmitted(true);
    toast.success("Avaliação concluída!");
  }

  function handleResetQuiz() {
    setAnswers({});
    setQuizSubmitted(false);
  }

  const correctCount = Object.entries(answers).filter(
    ([qIdx, optIdx]) => filteredQuestions[Number(qIdx)]?.correct === optIdx
  ).length;
  const quizScore = filteredQuestions.length > 0
    ? Math.round((correctCount / filteredQuestions.length) * 100)
    : 0;
  const isCertified = quizScore >= 80;

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-12">
      <PageHeader
        title="Capacitação & Treino Comercial"
        sub="Simulador avançado de vendas com IA — 8 personas reais — e certificação de boas práticas comerciais."
      />

      {/* ── ABAS ── */}
      <div className="flex border-b">
        <button
          type="button"
          onClick={() => setTab("quiz")}
          className={`flex items-center gap-2 pb-3 px-4 text-sm font-medium border-b-2 transition-colors ${
            tab === "quiz" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <HelpCircle className="h-4 w-4" /> Certificação Comercial
        </button>
        <button
          type="button"
          onClick={() => setTab("roleplay")}
          className={`flex items-center gap-2 pb-3 px-4 text-sm font-medium border-b-2 transition-colors ${
            tab === "roleplay" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Bot className="h-4 w-4" /> Simulador com IA (8 Personas)
        </button>
      </div>

      {/* ══════════════════════════════════════════
          ABA 1: QUESTIONÁRIO DE CERTIFICAÇÃO (10 questões)
         ══════════════════════════════════════════ */}
      {tab === "quiz" && (
        <div className="space-y-5 animate-in fade-in duration-200">
          <div className="rounded-xl border bg-card p-6 shadow-sm space-y-3">
            <h2 className="text-base font-semibold flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Avaliação de Boas Práticas Comerciais Alliar
            </h2>
            <p className="text-sm text-muted-foreground">
              {filteredQuestions.length} questões práticas sobre funil de vendas, WhatsApp comercial, negociação B2B e fechamento.
              Pontuação mínima para certificação: <strong>80 / 100</strong>.
            </p>

            {/* Filtro por categoria */}
            <div className="space-y-2 pt-1">
              <span className="text-xs font-semibold text-muted-foreground">Filtrar por tema (opcional):</span>
              <div className="flex flex-wrap gap-1.5">
                {allCategories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() =>
                      setSelectedCategories((prev) =>
                        prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
                      )
                    }
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-[11px] font-medium border transition-colors",
                      selectedCategories.includes(cat)
                        ? "bg-primary/10 text-primary border-primary/40"
                        : "bg-muted/40 text-muted-foreground border-transparent hover:border-muted"
                    )}
                  >
                    {cat}
                  </button>
                ))}
                {selectedCategories.length > 0 && (
                  <button onClick={() => setSelectedCategories([])} className="text-[11px] text-muted-foreground hover:text-foreground underline ml-1">
                    Limpar filtros
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Resultado */}
          {quizSubmitted && (
            <div className={cn(
              "rounded-xl border p-6 text-center space-y-3",
              isCertified ? "bg-emerald-950/20 border-emerald-800" : "bg-destructive/10 border-destructive/30"
            )}>
              <div className="flex justify-center">
                {isCertified ? (
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-500">
                    <Award className="h-8 w-8" />
                  </div>
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/20 text-destructive">
                    <XCircle className="h-8 w-8" />
                  </div>
                )}
              </div>
              <div>
                <div className="text-4xl font-black">{quizScore} <span className="text-base font-normal text-muted-foreground">/ 100</span></div>
                <h3 className="font-bold text-lg mt-1">
                  {isCertified ? "🏆 Parabéns! Vendedor Certificado Alliar" : "Quase lá! Revise as explicações e tente novamente."}
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  {correctCount} de {filteredQuestions.length} perguntas corretas
                  {isCertified && " — Você está pronto para fechar mais negócios pelo WhatsApp!"}
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={handleResetQuiz}>
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Fazer o teste novamente
              </Button>
            </div>
          )}

          {/* Questões */}
          <div className="space-y-4">
            {filteredQuestions.map((item, qIdx) => {
              const selectedOpt = answers[qIdx];
              return (
                <div key={qIdx} className="rounded-xl border bg-card p-5 space-y-3 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-semibold text-foreground leading-snug">{item.question}</h3>
                    <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                      {item.category}
                    </span>
                  </div>

                  <div className="space-y-2">
                    {item.options.map((opt, optIdx) => {
                      const isSelected = selectedOpt === optIdx;
                      const isCorrect = item.correct === optIdx;
                      let btnStyle = "border-input bg-background hover:bg-muted/40";
                      if (quizSubmitted) {
                        if (isCorrect) btnStyle = "border-emerald-600 bg-emerald-950/30 text-emerald-400 font-medium";
                        else if (isSelected && !isCorrect) btnStyle = "border-destructive bg-destructive/20 text-destructive";
                      } else if (isSelected) {
                        btnStyle = "border-primary bg-primary/10 text-primary font-medium";
                      }
                      return (
                        <button
                          key={optIdx}
                          type="button"
                          disabled={quizSubmitted}
                          onClick={() => handleSelectOption(qIdx, optIdx)}
                          className={`w-full p-3 rounded-lg border text-left text-xs sm:text-sm flex items-center justify-between gap-2 transition-colors ${btnStyle}`}
                        >
                          <span>{opt}</span>
                          {quizSubmitted && isCorrect && <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />}
                          {quizSubmitted && isSelected && !isCorrect && <XCircle className="h-4 w-4 text-destructive shrink-0" />}
                        </button>
                      );
                    })}
                  </div>

                  {quizSubmitted && (
                    <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground border-l-2 border-primary">
                      <strong>Explicação:</strong> {item.explanation}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {!quizSubmitted && (
            <div className="flex justify-end pt-2">
              <Button onClick={handleFinishQuiz} size="lg" className="px-8 gap-2">
                <CheckCircle2 className="h-4 w-4" /> Finalizar e Calcular Nota
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════
          ABA 2: SIMULADOR COM IA — 8 PERSONAS
         ══════════════════════════════════════════ */}
      {tab === "roleplay" && (
        <div className="space-y-5 animate-in fade-in duration-200">
          {/* Grid de seleção de persona */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground">Escolha o tipo de cliente para simular:</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {(Object.entries(PERSONAS) as [P, typeof PERSONAS[P]][]).map(([key, persona]) => (
                <button
                  key={key}
                  onClick={() => start(key)}
                  className={cn(
                    "flex items-start gap-3 rounded-xl border p-3 text-left transition-all hover:border-primary/50",
                    p === key ? "border-primary bg-primary/5" : "border-border bg-card"
                  )}
                >
                  <span className="text-xl shrink-0">{persona.icon}</span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-xs text-foreground">{persona.label}</span>
                      <span className={cn("text-[10px] font-bold", persona.diffColor)}>{persona.difficulty}</span>
                    </div>
                    <span className="block text-[11px] text-muted-foreground line-clamp-1 mt-0.5">{persona.category}</span>
                  </div>
                  {p === key && <ChevronRight className="size-4 text-primary shrink-0 ml-auto mt-0.5" />}
                </button>
              ))}
            </div>
          </div>

          {/* Dica da persona ativa */}
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 flex items-start gap-2 text-xs">
            <Zap className="size-3.5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-foreground">Dica para {PERSONAS[p].label}:</span>{" "}
              <span className="text-muted-foreground">{PERSONAS[p].tip}</span>
            </div>
          </div>

          {/* Chat de simulação */}
          <div className="rounded-xl border bg-card shadow-sm">
            <div className="flex items-center justify-between border-b px-4 py-2.5">
              <div className="flex items-center gap-2 text-xs">
                <span className="text-base">{PERSONAS[p].icon}</span>
                <span className="font-semibold text-foreground">{PERSONAS[p].label}</span>
                <span className="text-muted-foreground">· {PERSONAS[p].category}</span>
              </div>
              <span className="text-[11px] text-muted-foreground font-mono">
                {mine}/{ROUNDS} turnos
              </span>
            </div>

            <div className="min-h-72 space-y-3 p-4 overflow-y-auto max-h-[420px]">
              {msgs.map((m, i) => (
                <div
                  key={i}
                  className={cn(
                    "max-w-[82%] rounded-xl px-4 py-2.5 text-sm shadow-sm",
                    m.me
                      ? "ml-auto bg-primary text-primary-foreground"
                      : "bg-muted text-foreground"
                  )}
                >
                  {m.t}
                </div>
              ))}
              {busy && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {mine >= ROUNDS ? "IA avaliando seu desempenho…" : "Cliente digitando…"}
                </div>
              )}
            </div>

            {result ? (
              <div className="flex items-start justify-between gap-4 border-t p-4 bg-muted/20 rounded-b-xl">
                <div className="flex gap-3">
                  <Award className="h-7 w-7 shrink-0 text-amber-500 mt-0.5" />
                  <div>
                    {!Number.isNaN(score) && (
                      <div className="text-2xl font-bold">
                        {score}
                        <span className="text-sm font-normal text-muted-foreground">/100</span>
                      </div>
                    )}
                    <div className="whitespace-pre-wrap text-sm text-muted-foreground mt-1">
                      {result.replace(/NOTA:\s*\d+\s*/i, "")}
                    </div>
                  </div>
                </div>
                <Button size="sm" onClick={() => start(p)}>Treinar de novo</Button>
              </div>
            ) : (
              <form
                className="flex gap-2 border-t p-3"
                onSubmit={(e) => { e.preventDefault(); void send(); }}
              >
                <Input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={`Sua resposta ao cliente (turno ${mine + 1} de ${ROUNDS})…`}
                  maxLength={1000}
                  disabled={busy}
                  className="rounded-lg text-sm"
                />
                <Button size="icon" disabled={busy} aria-label="Enviar" className="rounded-lg shrink-0">
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            )}
          </div>

          {/* Legenda de dificuldade */}
          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground justify-center pt-1">
            <span className="flex items-center gap-1"><span className="text-amber-500 font-bold">Médio</span> — Objeções comuns de preço e tempo</span>
            <span className="flex items-center gap-1"><span className="text-red-500 font-bold">Difícil</span> — Exige pitch rápido e prova social</span>
            <span className="flex items-center gap-1"><span className="text-purple-500 font-bold">Avançado</span> — Negociação B2B e retenção</span>
          </div>
        </div>
      )}
    </div>
  );
}
