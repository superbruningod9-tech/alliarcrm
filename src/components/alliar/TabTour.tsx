import { useState } from "react";
import { useRouterState, useNavigate } from "@tanstack/react-router";
import {
  HelpCircle,
  Columns3,
  BarChart3,
  Inbox,
  Smartphone,
  PhoneCall,
  Contact,
  ClipboardList,
  FileText,
  Headset,
  Compass,
  GitBranch,
  GraduationCap,
  Gift,
  Plug,
  Users,
  Settings,
  Home,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  ExternalLink,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export interface TabGuide {
  path: string;
  name: string;
  badge: string;
  icon: typeof Home;
  shortDesc: string;
  purpose: string;
  steps: { title: string; text: string }[];
  proTip: string;
}

export const TAB_GUIDES: Record<string, TabGuide> = {
  "/dashboard": {
    path: "/dashboard",
    name: "Painel do Dia (Cockpit Matinal)",
    badge: "Início",
    icon: Home,
    shortDesc: "Sua central de comando para iniciar o dia de vendas focado no que dá dinheiro.",
    purpose: "Mostrar as metas financeiras do dia, os 3 negócios com maior chance de fechamento imediato e alertas anti-vácuo de clientes esperando resposta.",
    steps: [
      { title: "1. Cheque as Metas", text: "Defina sua meta diária de vendas no card superior e acompanhe o progresso em tempo real." },
      { title: "2. Ataque o Top 3", text: "Feche primeiro os 3 negócios quentes em destaque usando os botões rápidos de WhatsApp ou Ganho." },
      { title: "3. Limpe o Radar Anti-Vácuo", text: "Responda imediatamente aos leads em alerta amarelo para não perder clientes para a concorrência." },
    ],
    proTip: "Comece seu dia sempre por esta tela. 80% das suas vendas do mês virão de responder aos leads quentes logo pela manhã.",
  },
  "/pipeline": {
    path: "/pipeline",
    name: "Funil de Vendas (Kanban)",
    badge: "Funil",
    icon: Columns3,
    shortDesc: "Gestão visual de todas as oportunidades, da chegada do lead até o fechamento.",
    purpose: "Organizar seus leads em colunas que refletem a jornada do cliente (Novos → Contato → Proposta → Negociação → Ganho), permitindo avançar negócios arrastando cartões.",
    steps: [
      { title: "1. Novos Leads", text: "Leads que acabaram de chegar. Faça o primeiro contato em menos de 5 minutos." },
      { title: "2. Proposta Enviada", text: "Envie a proposta comercial com QR Code PIX embutido." },
      { title: "3. Marcar Ganho", text: "Ao receber o comprovante ou confirmação do PIX, mova para Ganho para celebrar com confetes e registrar a comissão." },
    ],
    proTip: "Use os atalhos de teclado: pressione J/K para navegar entre clientes, tecla 1 para PIX e tecla 3 para mover para Ganho.",
  },
  "/metrics": {
    path: "/metrics",
    name: "Métricas & Painéis B2B",
    badge: "Painéis",
    icon: BarChart3,
    shortDesc: "Painéis de inteligência comercial com KPIs 100% calculados sobre seus dados reais.",
    purpose: "Visualizar taxas de conversão de cada etapa do funil, volume total em negociação, tempo de resposta e ranking de desempenho dos vendedores.",
    steps: [
      { title: "1. Visão Geral", text: "Acompanhe faturamento acumulado, ticket médio real e taxa de conversão geral." },
      { title: "2. Saúde do Funil", text: "Identifique em qual coluna os clientes estão travando para melhorar seus argumentos." },
      { title: "3. Ranking da Equipe", text: "Veja quem mais fechou vendas e o valor gerado por cada membro da equipe." },
    ],
    proTip: "Nenhuma métrica é inventada. Se você tem 5 leads cadastrados, os números calculam exatamente em cima desses 5 clientes.",
  },
  "/inbox": {
    path: "/inbox",
    name: "Conversas & WhatsApp",
    badge: "Conversas",
    icon: Inbox,
    shortDesc: "Central de atendimento de mensagens com sugestões de respostas por IA.",
    purpose: "Centralizar todas as trocas de mensagens com seus clientes, permitindo disparar respostas rápidas, orçamentos e áudios sem sair do CRM.",
    steps: [
      { title: "1. Selecionar Contato", text: "Escolha o cliente na lista lateral para abrir o histórico completo da conversa." },
      { title: "2. Respostas Prontas", text: "Use modelos de mensagens pré-formatadas para economizar tempo em perguntas frequentes." },
      { title: "3. Sugestão da IA", text: "A IA analisa a objeção do cliente e sugere a melhor resposta para contornar o problema." },
    ],
    proTip: "Responda leads no primeiro minuto de contato para aumentar a chance de fechamento em até 391%.",
  },
  "/whatsapp": {
    path: "/whatsapp",
    name: "WhatsApp Conectado",
    badge: "WhatsApp",
    icon: Smartphone,
    shortDesc: "Configuração do canal oficial de WhatsApp e números de atendimento.",
    purpose: "Conectar e gerenciar a linha de WhatsApp da sua empresa, disparar mensagens de boas-vindas automáticas e testar templates de cobrança.",
    steps: [
      { title: "1. Cadastre o Número", text: "Informe o número oficial da sua empresa com DDD nas Configurações." },
      { title: "2. Boas-vindas Automáticas", text: "Ative o disparo de boas-vindas imediato para todo novo lead captado." },
      { title: "3. Disparos Manuais", text: "Use os botões de 1 clique para abrir o WhatsApp Web ou Desktop com a mensagem preenchida." },
    ],
    proTip: "Mantenha o número sempre no formato brasileiro padrão com DDD (ex: 11988887777).",
  },
  "/dialer": {
    path: "/dialer",
    name: "Discador Comercial",
    badge: "Discador",
    icon: PhoneCall,
    shortDesc: "Teclado e histórico de ligações com ficha do cliente em tela.",
    purpose: "Fazer ligações comerciais com 1 clique (via tel:, WhatsApp Call ou WebRTC), visualizando anotações anteriores enquanto fala com o cliente.",
    steps: [
      { title: "1. Digite ou Selecione", text: "Use o teclado numérico ou clique em um contato recente para carregar o telefone." },
      { title: "2. Inicie a Chamada", text: "Clique em Ligar para acionar o discador do celular ou aplicativo de voz." },
      { title: "3. Registre o Resumo", text: "Ao encerrar, anote o resultado da conversa para ficar registrado na timeline do cliente." },
    ],
    proTip: "Ligue para os leads quentes que não responderam no WhatsApp. Uma chamada rápida de 2 minutos resolve mais do que 20 mensagens de texto.",
  },
  "/contatos": {
    path: "/contatos",
    name: "Contatos & Empresas",
    badge: "Contatos",
    icon: Contact,
    shortDesc: "Banco de dados unificado de todos os clientes, empresas e tomadores de decisão.",
    purpose: "Armazenar informações completas dos clientes: CNPJ, endereço, telefone, e-mail, responsáveis e histórico completo de compras.",
    steps: [
      { title: "1. Busca Rápida", text: "Encontre qualquer cliente por nome, empresa, telefone ou CNPJ." },
      { title: "2. Ficha Completa", text: "Abra a ficha para ver todas as propostas, chamados de pós-venda e notas." },
      { title: "3. Exportar Lista", text: "Exporte sua base para planilhas sempre que precisar rodar campanhas externas." },
    ],
    proTip: "Mantenha o CNPJ preenchido para consultar automaticamente os sócios da empresa via Receita Federal.",
  },
  "/forms": {
    path: "/forms",
    name: "Questionários & Formulários",
    badge: "Formulários",
    icon: ClipboardList,
    shortDesc: "Gerador de formulários de qualificação e entrada de leads.",
    purpose: "Criar formulários de pré-venda e qualificação que você pode enviar pelo WhatsApp ou embutir no seu site para captar novos clientes automaticamente.",
    steps: [
      { title: "1. Crie o Questionário", text: "Defina as perguntas essenciais: nome, WhatsApp, empresa, faturamento e necessidade." },
      { title: "2. Compartilhe o Link", text: "Envie o link para o cliente responder no celular antes da reunião." },
      { title: "3. Entrada no Funil", text: "Cada resposta vira automaticamente um lead no funil na etapa 'Novos'." },
    ],
    proTip: "Formulários curtos (3 a 5 perguntas) têm 40% mais taxa de conclusão do que formulários longos.",
  },
  "/propostas": {
    path: "/propostas",
    name: "Propostas & Cobrança PIX",
    badge: "Propostas",
    icon: FileText,
    shortDesc: "Criador de orçamentos formais com link dinâmico e QR Code PIX.",
    purpose: "Gerar propostas profissionais com tabela de itens, prazo de validade e cobrança PIX Cópia e Cola embutida para pagamento imediato.",
    steps: [
      { title: "1. Monte o Orçamento", text: "Adicione os itens ou planos, quantidades e condições de desconto." },
      { title: "2. Gere o Link da Proposta", text: "Envie o link profissional para o cliente visualizar no celular sem precisar baixar PDF." },
      { title: "3. Receba via PIX", text: "O cliente paga direto na página da proposta. O sistema avisa quando a proposta foi aberta." },
    ],
    proTip: "Cadastre sua chave PIX nas Configurações para que todas as propostas venham com cobrança automática.",
  },
  "/portal": {
    path: "/portal",
    name: "Pós-Venda, NPS & Chamados",
    badge: "Pós-Venda",
    icon: Headset,
    shortDesc: "Portal do cliente com link mágico, chamados com SLA e acompanhamento de entrega.",
    purpose: "Garantir retenção e satisfação após o fechamento: rastreio de implantação, abertura de tickets de suporte com prazo (SLA) e pesquisa NPS pelo WhatsApp.",
    steps: [
      { title: "1. Link Mágico do Cliente", text: "Copie o link individual sem senha e envie para o cliente acompanhar seu projeto." },
      { title: "2. Rastreio da Implantação", text: "Atualize os passos (Pagamento → Contrato → Configuração → Entregue)." },
      { title: "3. Gestão de Chamados", text: "Abra e resolva dúvidas com protocolos de atendimento e prazos de SLA." },
    ],
    proTip: "Clientes satisfeitos no pós-venda geram 60% mais indicações espontâneas. Dispare o NPS 7 dias após a entrega.",
  },
  "/prospeccao": {
    path: "/prospeccao",
    name: "Prospecção Ativa B2B",
    badge: "Prospecção",
    icon: Compass,
    shortDesc: "Buscador de empresas reais no Google Maps e consulta de CNPJs na Receita Federal.",
    purpose: "Encontrar empresas reais em qualquer cidade do Brasil por segmento, verificar CNPJ, quadro societário e importar diretamente para o funil de vendas.",
    steps: [
      { title: "1. Busca no Mapa", text: "Escolha o segmento e a cidade para ver estabelecimentos reais com endereço e telefone." },
      { title: "2. Consulta por CNPJ", text: "Digite o CNPJ para puxar razão social, sócios e dados oficiais da Receita Federal." },
      { title: "3. Importar com 1 Clique", text: "O contato entra no funil pronto para sua equipe iniciar a abordagem comercial." },
    ],
    proTip: "Todos os dados são 100% reais. Se um estabelecimento não informou telefone público, o sistema indica claramente 'Telefone não disponível' para você nunca passar dados falsos ao vendedor.",
  },
  "/workflows": {
    path: "/workflows",
    name: "Automações & Nós de Processo",
    badge: "Automações",
    icon: GitBranch,
    shortDesc: "Gatilhos automáticos para acelerar o fluxo comercial da sua empresa.",
    purpose: "Criar regras inteligentes: mensagens automáticas de boas-vindas, lembretes de retorno e transferências anti-vácuo entre vendedores.",
    steps: [
      { title: "1. Escolha o Gatilho", text: "Quando um novo lead entrar ou quando um negócio mudar de fase." },
      { title: "2. Defina a Ação", text: "Enviar mensagem pelo WhatsApp, criar tarefa ou transferir responsável." },
      { title: "3. Monitore os Disparos", text: "Veja quantas automações rodaram com sucesso no log de eventos." },
    ],
    proTip: "Ative a regra anti-vácuo de 5 minutos no Modo Equipe para garantir que nenhum lead fique sem resposta.",
  },
  "/treino": {
    path: "/treino",
    name: "Treino com IA & Simulador",
    badge: "Treinamento",
    icon: GraduationCap,
    shortDesc: "Ambiente de capacitação comercial com 8 personas de clientes difíceis e quiz de vendas.",
    purpose: "Treinar seus vendedores em um ambiente seguro antes de atenderem clientes reais. Roleplay com clientes pechincheiros, indecisos, apressados e B2B exigentes.",
    steps: [
      { title: "1. Escolha a Persona", text: "Selecione entre 8 perfis de clientes reais do mercado brasileiro." },
      { title: "2. Faça o Roleplay", text: "Converse em 5 rodadas simulando a negociação. A IA dá nota e feedback técnico." },
      { title: "3. Quiz de Vendas", text: "Teste conhecimentos sobre velocidade de resposta, contorno de preço e técnicas SPIN." },
    ],
    proTip: "Esta é a ÚNICA área do sistema com simulações. Todo o resto do Alliar opera exclusivamente com seus dados reais de negócio.",
  },
  "/indicacoes": {
    path: "/indicacoes",
    name: "Programa de Indicações Member-Get-Member",
    badge: "Indicações",
    icon: Gift,
    shortDesc: "Transforme seus clientes atuais em promotores ativos que trazem novos clientes.",
    purpose: "Gerar links mágicos de indicação para cada cliente, rastrear novos negócios originados por eles e premiar com cashback ou comissão automaticamente ao fechar a venda.",
    steps: [
      { title: "1. Gerar Link do Indicador", text: "Gere o link individual para seu cliente parceiro compartilhar com conhecidos." },
      { title: "2. Acompanhe as Indicações", text: "Quando um amigo cadastrar, o lead entra marcado com o nome do indicador." },
      { title: "3. Pagamento de Recompensa", text: "Ao fechar a venda, o sistema calcula a comissão/cashback devida ao indicador." },
    ],
    proTip: "Ofereça de 5% a 10% de cashback para clientes fiéis. O custo de aquisição de um lead indicado é até 80% menor do que anúncios.",
  },
  "/integracoes": {
    path: "/integracoes",
    name: "Integrações & Conexões",
    badge: "Integrações",
    icon: Plug,
    shortDesc: "Conecte a Alliar a ferramentas externas, webhooks e plataformas de pagamento.",
    purpose: "Conectar canais de geração de leads (Meta Ads, Google Ads, Zapier, Webhooks) e gateways financeiros diretamente à sua conta.",
    steps: [
      { title: "1. Webhooks de Entrada", text: "Receba leads de formulários externos ou páginas de captura." },
      { title: "2. Chaves de API", text: "Integre com sistemas legados ou ERPs da empresa." },
      { title: "3. Teste de Conexão", text: "Dispare eventos de teste para garantir que o fluxo está funcionando." },
    ],
    proTip: "Use webhooks para conectar formulários do seu site diretamente na coluna 'Novos' do funil.",
  },
  "/equipe": {
    path: "/equipe",
    name: "Equipe, Metas & Vendedores",
    badge: "Equipe",
    icon: Users,
    shortDesc: "Gestão dos colaboradores comerciais, metas individuais e controle de acesso.",
    purpose: "Cadastrar vendedores, acompanhar metas individuais de receita, distribuir leads em rodízio (round-robin) e gerenciar permissões de acesso.",
    steps: [
      { title: "1. Convide Membros", text: "Gere links de convite para os vendedores acessarem a mesma empresa." },
      { title: "2. Atribua Metas", text: "Defina os objetivos de faturamento para cada vendedor no mês." },
      { title: "3. Distribuição Automática", text: "Ative a distribuição equitativa de leads que chegam pelo site e WhatsApp." },
    ],
    proTip: "No Modo Solo esta aba fica oculta para manter sua tela limpa. Alterne para Modo Equipe nas Configurações sempre que contratar alguém.",
  },
  "/configuracoes": {
    path: "/configuracoes",
    name: "Configurações da Empresa",
    badge: "Configurações",
    icon: Settings,
    shortDesc: "Controle geral da conta: modo Solo/Equipe, comissões, chave PIX e convites.",
    purpose: "Configurar o perfil do usuário, alterar entre Modo Solo e Modo Equipe, gerenciar comissões padrão, cadastrar chave PIX da empresa e convidar novos colaboradores.",
    steps: [
      { title: "1. Escolha o Modo de Trabalho", text: "Use a barra de divisão para alternar entre Modo Solo e Modo Equipe." },
      { title: "2. Chave PIX e Comissões", text: "Cadastre sua chave PIX para cobrança automática nas propostas comerciais." },
      { title: "3. Envie Convites", text: "Gere links de convite por e-mail ou WhatsApp para novos membros da empresa." },
    ],
    proTip: "Apenas administradores podem mudar o modo da empresa ou alterar a taxa de comissão padrão.",
  },
  "/perfil": {
    path: "/perfil",
    name: "Meu Perfil Comercial",
    badge: "Perfil",
    icon: User,
    shortDesc: "Sua identidade pública, foto de perfil, capa, bio, links sociais e cartão digital.",
    purpose: "Personalizar sua apresentação pública como vendedor, compartilhar seu cartão de visitas digital com QR Code e acompanhar suas conquistas e métricas individuais.",
    steps: [
      { title: "1. Capa e Foto", text: "Escolha um tema de gradiente para sua capa e defina sua foto ou avatar comercial." },
      { title: "2. Links Sociais", text: "Cadastre seu WhatsApp, LinkedIn e Instagram para facilitar o contato de clientes." },
      { title: "3. Cartão Digital", text: "Gere o QR Code do seu cartão de visitas digital para compartilhar em reuniões e propostas." },
    ],
    proTip: "Um perfil completo com foto profissional e bio clara aumenta a confiança do lead e a taxa de resposta em 45%.",
  },
};

export function TabTour() {
  const routerState = useRouterState();
  const navigate = useNavigate();
  const currentPath = routerState.location.pathname;

  const [open, setOpen] = useState(false);
  const [selectedPath, setSelectedPath] = useState(currentPath);

  // Sincroniza caminho selecionado quando abre
  const handleOpen = () => {
    setSelectedPath(TAB_GUIDES[currentPath] ? currentPath : "/dashboard");
    setOpen(true);
  };

  const defaultGuide = TAB_GUIDES["/dashboard"]!;
  const currentGuide = TAB_GUIDES[selectedPath] ?? defaultGuide;
  const guideKeys = Object.keys(TAB_GUIDES);
  const currentIndex = Math.max(0, guideKeys.indexOf(selectedPath));

  const handleNext = () => {
    const nextIdx = (currentIndex + 1) % guideKeys.length;
    const nextKey = guideKeys[nextIdx] ?? "/dashboard";
    setSelectedPath(nextKey);
  };

  const handlePrev = () => {
    const prevIdx = (currentIndex - 1 + guideKeys.length) % guideKeys.length;
    const prevKey = guideKeys[prevIdx] ?? "/dashboard";
    setSelectedPath(prevKey);
  };

  const handleGoToPage = (path: string) => {
    setOpen(false);
    void navigate({ to: path });
  };

  const Icon = currentGuide.icon;

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={handleOpen}
        className="gap-1.5 text-xs text-muted-foreground hover:text-foreground border-primary/20 hover:border-primary/50"
      >
        <Sparkles className="size-3.5 text-amber-500" />
        <span className="hidden sm:inline">Guia deste módulo</span>
        <span className="sm:hidden">Guia</span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="border-b pb-3">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                {currentGuide.badge}
              </span>
              <span className="text-xs text-muted-foreground">Módulo {currentIndex + 1} de {guideKeys.length}</span>
            </div>
            <DialogTitle className="flex items-center gap-2 text-xl mt-1">
              <div className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
                <Icon className="size-5" />
              </div>
              <span>{currentGuide.name}</span>
            </DialogTitle>
            <DialogDescription className="text-sm">
              {currentGuide.shortDesc}
            </DialogDescription>
          </DialogHeader>

          {/* NAVEGADOR DE ABAS (CHIPS) */}
          <div className="flex flex-wrap gap-1.5 py-2 border-b">
            {guideKeys.map((k) => {
              const g = TAB_GUIDES[k];
              if (!g) return null;
              const isSelected = k === selectedPath;
              const isCurrentRoute = k === currentPath;
              return (
                <button
                  key={k}
                  onClick={() => setSelectedPath(k)}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[11px] font-medium transition-all flex items-center gap-1",
                    isSelected
                      ? "bg-primary text-primary-foreground font-semibold shadow-sm"
                      : isCurrentRoute
                      ? "bg-primary/15 text-primary border border-primary/30"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  )}
                >
                  <g.icon className="size-3" />
                  {g.badge}
                </button>
              );
            })}
          </div>

          <div className="space-y-4 py-2">
            {/* O QUE FAZ */}
            <div className="rounded-xl border bg-muted/20 p-4 space-y-1.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <CheckCircle2 className="size-3.5 text-emerald-500" />
                Para que serve no seu dia a dia
              </h3>
              <p className="text-sm text-foreground leading-relaxed">{currentGuide.purpose}</p>
            </div>

            {/* PASSO A PASSO */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Como usar passo a passo
              </h3>
              <div className="grid gap-2 sm:grid-cols-3">
                {currentGuide.steps.map((s, idx) => (
                  <div key={idx} className="rounded-lg border bg-card p-3 space-y-1">
                    <p className="text-xs font-bold text-primary">{s.title}</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">{s.text}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* DICA DE OURO */}
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 flex items-start gap-3">
              <Sparkles className="size-4 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-amber-600 dark:text-amber-400">Dica de Alta Conversão Alliar</p>
                <p className="text-xs text-foreground/80 mt-0.5 leading-relaxed">{currentGuide.proTip}</p>
              </div>
            </div>
          </div>

          {/* CONTROLES DE NAVEGAÇÃO */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handlePrev} className="gap-1 text-xs">
                <ArrowLeft className="size-3.5" /> Anterior
              </Button>
              <Button variant="outline" size="sm" onClick={handleNext} className="gap-1 text-xs">
                Próximo <ArrowRight className="size-3.5" />
              </Button>
            </div>

            <div className="flex items-center gap-2">
              {currentPath !== selectedPath && (
                <Button size="sm" onClick={() => handleGoToPage(selectedPath)} className="gap-1 text-xs">
                  Ir para {currentGuide.badge} <ExternalLink className="size-3" />
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)} className="text-xs">
                Fechar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
