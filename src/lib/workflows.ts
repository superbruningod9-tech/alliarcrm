import { supabase } from "@/integrations/supabase/client";

export type NodeType = "trigger" | "action" | "delay" | "condition";

export type TriggerSubtype = "lead_created" | "stage_changed" | "form_submitted" | "deal_won";
export type ActionSubtype = "send_whatsapp" | "send_audio" | "notify_seller" | "move_stage" | "add_tag" | "open_ticket";
export type DelaySubtype = "wait_minutes" | "wait_hours" | "wait_days";
export type ConditionSubtype = "lead_replied" | "deal_value_gt" | "proposal_opened";

export interface WorkflowNode {
  id: string;
  type: NodeType;
  subtype: string;
  label: string;
  description: string;
  config: Record<string, any>;
  position: { x: number; y: number };
}

export interface WorkflowEdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  branch?: "yes" | "no" | "default";
}

export interface Workflow {
  id: string;
  tenantId: string;
  name: string;
  description: string;
  active: boolean;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  createdAt: string;
  updatedAt: string;
  executionsCount: number;
}

export interface WorkflowExecutionLog {
  id: string;
  tenantId: string;
  workflowId: string;
  workflowName: string;
  leadId: string;
  leadName: string;
  nodeId: string;
  nodeLabel: string;
  status: "success" | "delayed" | "branched_yes" | "branched_no" | "error";
  output: string;
  executedAt: string;
}

const WORKFLOW_STORAGE_PREFIX = "alliar:workflows:";
const EXECUTION_LOGS_PREFIX = "alliar:workflow_logs:";

export const PRESET_WORKFLOW_TEMPLATES: Omit<Workflow, "id" | "tenantId" | "createdAt" | "updatedAt" | "executionsCount">[] = [
  {
    name: "Boas-Vindas Imediata & Follow-up Fantasma",
    description: "Dispara WhatsApp inicial, aguarda 2 horas e, se o lead não responder, envia áudio persuasivo de follow-up.",
    active: true,
    nodes: [
      {
        id: "node-1",
        type: "trigger",
        subtype: "lead_created",
        label: "Gatilho: Novo Lead no Funil",
        description: "Disparado quando um lead entra na etapa 'Novos'",
        config: { stage: "novo" },
        position: { x: 50, y: 50 },
      },
      {
        id: "node-2",
        type: "action",
        subtype: "send_whatsapp",
        label: "Ação: WhatsApp de Boas-Vindas",
        description: "Envia mensagem de saudação e abertura",
        config: { message: "Olá, {{name}}! Tudo bem? Recebemos seu interesse na Alliar. Como podemos te ajudar hoje?" },
        position: { x: 50, y: 160 },
      },
      {
        id: "node-3",
        type: "delay",
        subtype: "wait_hours",
        label: "Delay: Aguardar 2 Horas",
        description: "Espera a resposta do cliente antes do follow-up",
        config: { duration: 2, unit: "hours" },
        position: { x: 50, y: 270 },
      },
      {
        id: "node-4",
        type: "condition",
        subtype: "lead_replied",
        label: "Condição: O Lead Respondeu?",
        description: "Verifica se houve resposta no WhatsApp nas últimas 2h",
        config: { criteria: "has_incoming_msg" },
        position: { x: 50, y: 380 },
      },
      {
        id: "node-5",
        type: "action",
        subtype: "notify_seller",
        label: "Ramo SIM: Notificar Vendedor",
        description: "Alerta o vendedor para assumir a negociação imediatamente",
        config: { alert: "Lead ativo e respondendo! Abrir chat." },
        position: { x: -120, y: 500 },
      },
      {
        id: "node-6",
        type: "action",
        subtype: "send_audio",
        label: "Ramo NÃO: Áudio de Follow-up",
        description: "Envia áudio natural gravado para quebrar o vácuo",
        config: { text: "Oi! Vi que ainda não conseguimos nos falar. Consegue 2 minutinhos hoje?" },
        position: { x: 220, y: 500 },
      },
    ],
    edges: [
      { id: "e1-2", fromNodeId: "node-1", toNodeId: "node-2", branch: "default" },
      { id: "e2-3", fromNodeId: "node-2", toNodeId: "node-3", branch: "default" },
      { id: "e3-4", fromNodeId: "node-3", toNodeId: "node-4", branch: "default" },
      { id: "e4-5", fromNodeId: "node-4", toNodeId: "node-5", branch: "yes" },
      { id: "e4-6", fromNodeId: "node-4", toNodeId: "node-6", branch: "no" },
    ],
  },
  {
    name: "Radar de Proposta & Fechamento PIX com Desconto",
    description: "Monitora abertura do orçamento: se cliente abrir e não comprar em 1h, oferece condição especial PIX.",
    active: true,
    nodes: [
      {
        id: "node-1",
        type: "trigger",
        subtype: "stage_changed",
        label: "Gatilho: Proposta Enviada",
        description: "Quando o lead é movido para 'Proposta enviada'",
        config: { stage: "proposta" },
        position: { x: 50, y: 50 },
      },
      {
        id: "node-2",
        type: "delay",
        subtype: "wait_minutes",
        label: "Delay: Aguardar 30 Minutos",
        description: "Tempo para o cliente analisar a proposta",
        config: { duration: 30, unit: "minutes" },
        position: { x: 50, y: 160 },
      },
      {
        id: "node-3",
        type: "condition",
        subtype: "proposal_opened",
        label: "Condição: Abriu a Proposta?",
        description: "Detecta se o cliente abriu o link do orçamento",
        config: { check: "radar_viewed" },
        position: { x: 50, y: 270 },
      },
      {
        id: "node-4",
        type: "action",
        subtype: "send_whatsapp",
        label: "Ramo SIM: Oferta PIX 5% OFF",
        description: "Envia PIX copia e cola com desconto de fechamento rápido",
        config: { message: "Vi que você está com a proposta aberta! Se fechar hoje no PIX consigo 5% de desconto imediato. Vamos fechar?" },
        position: { x: -120, y: 390 },
      },
      {
        id: "node-5",
        type: "action",
        subtype: "notify_seller",
        label: "Ramo NÃO: Ligar para Alinhar",
        description: "Agenda tarefa para o vendedor ligar via Discador",
        config: { alert: "Cliente não abriu proposta há 30 min. Ligar para confirmar recebimento." },
        position: { x: 220, y: 390 },
      },
    ],
    edges: [
      { id: "e1-2", fromNodeId: "node-1", toNodeId: "node-2", branch: "default" },
      { id: "e2-3", fromNodeId: "node-2", toNodeId: "node-3", branch: "default" },
      { id: "e3-4", fromNodeId: "node-3", toNodeId: "node-4", branch: "yes" },
      { id: "e3-5", fromNodeId: "node-3", toNodeId: "node-5", branch: "no" },
    ],
  },
  {
    name: "Onboarding Express Pós-Venda",
    description: "Ao fechar negócio, gera link mágico do cliente e abre chamado de implantação com SLA de 4h.",
    active: true,
    nodes: [
      {
        id: "node-1",
        type: "trigger",
        subtype: "deal_won",
        label: "Gatilho: Negócio Ganho",
        description: "Quando o lead é marcado como 'Ganho'",
        config: { stage: "ganho" },
        position: { x: 50, y: 50 },
      },
      {
        id: "node-2",
        type: "action",
        subtype: "open_ticket",
        label: "Ação: Abrir Chamado Onboarding",
        description: "Cria projeto de entrega no Pós-Venda (/portal)",
        config: { priority: "alta", title: "Implantação e Onboarding do Cliente" },
        position: { x: 50, y: 160 },
      },
      {
        id: "node-3",
        type: "action",
        subtype: "send_whatsapp",
        label: "Ação: Enviar Link Mágico do Portal",
        description: "Envia acesso direto sem senha ao portal de pós-venda",
        config: { message: "Parabéns pela parceria! Seu acesso exclusivo ao Portal Alliar está pronto: https://alliar.app/portal" },
        position: { x: 50, y: 270 },
      },
    ],
    edges: [
      { id: "e1-2", fromNodeId: "node-1", toNodeId: "node-2", branch: "default" },
      { id: "e2-3", fromNodeId: "node-2", toNodeId: "node-3", branch: "default" },
    ],
  },
];

export function fetchWorkflows(tenantId: string): Workflow[] {
  if (!tenantId) return [];
  try {
    const raw = localStorage.getItem(`${WORKFLOW_STORAGE_PREFIX}${tenantId}`);
    if (raw) return JSON.parse(raw);
  } catch {}

  // Carrega templates padrão iniciais
  const initial: Workflow[] = PRESET_WORKFLOW_TEMPLATES.map((tmpl, idx) => ({
    id: `wf-${idx + 1}`,
    tenantId,
    name: tmpl.name,
    description: tmpl.description,
    active: tmpl.active,
    nodes: tmpl.nodes,
    edges: tmpl.edges,
    createdAt: new Date(Date.now() - (idx + 1) * 86400000).toISOString(),
    updatedAt: new Date().toISOString(),
    executionsCount: (idx + 1) * 14,
  }));

  try {
    localStorage.setItem(`${WORKFLOW_STORAGE_PREFIX}${tenantId}`, JSON.stringify(initial));
  } catch {}

  return initial;
}

export async function saveWorkflow(tenantId: string, workflow: Workflow): Promise<Workflow[]> {
  const current = fetchWorkflows(tenantId);
  const exists = current.some((w) => w.id === workflow.id);
  const updated = exists
    ? current.map((w) => (w.id === workflow.id ? { ...workflow, updatedAt: new Date().toISOString() } : w))
    : [{ ...workflow, updatedAt: new Date().toISOString() }, ...current];

  try {
    localStorage.setItem(`${WORKFLOW_STORAGE_PREFIX}${tenantId}`, JSON.stringify(updated));
  } catch {}

  // Tenta persistir no Supabase se tabela existir
  try {
    void supabase.from("workflows" as any).upsert({
      id: workflow.id,
      tenant_id: tenantId,
      name: workflow.name,
      description: workflow.description,
      active: workflow.active,
      nodes: workflow.nodes,
      edges: workflow.edges,
      updated_at: new Date().toISOString(),
    });
  } catch {}

  return updated;
}

export function toggleWorkflowActive(tenantId: string, workflowId: string): Workflow[] {
  const current = fetchWorkflows(tenantId);
  const updated = current.map((w) => (w.id === workflowId ? { ...w, active: !w.active } : w));
  try {
    localStorage.setItem(`${WORKFLOW_STORAGE_PREFIX}${tenantId}`, JSON.stringify(updated));
  } catch {}
  return updated;
}

export function fetchWorkflowLogs(tenantId: string): WorkflowExecutionLog[] {
  if (!tenantId) return [];
  try {
    const raw = localStorage.getItem(`${EXECUTION_LOGS_PREFIX}${tenantId}`);
    if (raw) return JSON.parse(raw);
  } catch {}

  const initialLogs: WorkflowExecutionLog[] = [
    {
      id: "log-wf-1",
      tenantId,
      workflowId: "wf-1",
      workflowName: "Boas-Vindas Imediata & Follow-up Fantasma",
      leadId: "lead-camila",
      leadName: "Dra. Camila Siqueira",
      nodeId: "node-2",
      nodeLabel: "Ação: WhatsApp de Boas-Vindas",
      status: "success",
      output: "Mensagem enviada com sucesso para 31998765432",
      executedAt: new Date(Date.now() - 10 * 60000).toISOString(),
    },
    {
      id: "log-wf-2",
      tenantId,
      workflowId: "wf-1",
      workflowName: "Boas-Vindas Imediata & Follow-up Fantasma",
      leadId: "lead-camila",
      leadName: "Dra. Camila Siqueira",
      nodeId: "node-3",
      nodeLabel: "Delay: Aguardar 2 Horas",
      status: "delayed",
      output: "Aguardando janela de 2h (restam 1h 50m)",
      executedAt: new Date(Date.now() - 10 * 60000).toISOString(),
    },
    {
      id: "log-wf-3",
      tenantId,
      workflowId: "wf-2",
      workflowName: "Radar de Proposta & Fechamento PIX",
      leadId: "lead-sorriso",
      leadName: "Clínica Sorriso",
      nodeId: "node-4",
      nodeLabel: "Ramo SIM: Oferta PIX 5% OFF",
      status: "branched_yes",
      output: "Cliente abriu proposta. PIX Copia e Cola gerado e enviado.",
      executedAt: new Date(Date.now() - 40 * 60000).toISOString(),
    },
  ];

  try {
    localStorage.setItem(`${EXECUTION_LOGS_PREFIX}${tenantId}`, JSON.stringify(initialLogs));
  } catch {}

  return initialLogs;
}

export function recordWorkflowLog(tenantId: string, log: Omit<WorkflowExecutionLog, "id" | "tenantId" | "executedAt">) {
  const newLog: WorkflowExecutionLog = {
    id: `log-exec-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    tenantId,
    executedAt: new Date().toISOString(),
    ...log,
  };
  try {
    const list = fetchWorkflowLogs(tenantId);
    const updated = [newLog, ...list].slice(0, 50);
    localStorage.setItem(`${EXECUTION_LOGS_PREFIX}${tenantId}`, JSON.stringify(updated));
  } catch {}
  return newLog;
}

/**
 * Simula a execução do workflow passo a passo com um lead do CRM
 */
export async function simulateWorkflowExecution(params: {
  tenantId: string;
  workflow: Workflow;
  lead: { id: string; name: string; phone?: string; company?: string; stage: string };
  simulatedBranchChoice?: "yes" | "no";
}): Promise<{ stepsExecuted: string[]; branchTaken?: string; logs: WorkflowExecutionLog[] }> {
  const { tenantId, workflow, lead, simulatedBranchChoice = "yes" } = params;
  const stepsExecuted: string[] = [];
  const generatedLogs: WorkflowExecutionLog[] = [];

  // Percorre nós na ordem topológica a partir do gatilho
  const triggerNode = workflow.nodes.find((n) => n.type === "trigger") || workflow.nodes[0];
  if (!triggerNode) return { stepsExecuted: [], logs: [] };

  let currentNode: WorkflowNode | undefined = triggerNode;
  let branchResult: "yes" | "no" = simulatedBranchChoice;

  while (currentNode) {
    stepsExecuted.push(currentNode.label);

    let status: WorkflowExecutionLog["status"] = "success";
    let output = "";

    if (currentNode.type === "trigger") {
      output = `Gatilho ativado para o lead "${lead.name}" (${lead.stage})`;
    } else if (currentNode.type === "action") {
      if (currentNode.subtype === "send_whatsapp") {
        output = `WhatsApp disparado para ${lead.phone || lead.name}: "${currentNode.config["message"] || "Olá!"}"`;
        // Registra evento na timeline
        try {
          await supabase.from("lead_events").insert({
            tenant_id: tenantId,
            lead_id: lead.id,
            kind: "msg",
            text: `⚡ [Workflow: ${workflow.name}] ${currentNode.label}: ${currentNode.config["message"] || "Disparo realizado."}`,
          });
        } catch {}
      } else if (currentNode.subtype === "open_ticket") {
        output = `Chamado de pós-venda aberto com prioridade ${currentNode.config["priority"] || "alta"}`;
      } else {
        output = `Ação executada: ${currentNode.label}`;
      }
    } else if (currentNode.type === "delay") {
      status = "delayed";
      output = `Agendado para continuar em ${currentNode.config["duration"] || 2} ${currentNode.config["unit"] || "horas"}`;
    } else if (currentNode.type === "condition") {
      status = branchResult === "yes" ? "branched_yes" : "branched_no";
      output = `Condição avaliada: Resultado = ${branchResult.toUpperCase()} (${branchResult === "yes" ? "Critério atendido" : "Critério não atendido"})`;
    }

    const log = recordWorkflowLog(tenantId, {
      workflowId: workflow.id,
      workflowName: workflow.name,
      leadId: lead.id,
      leadName: lead.name,
      nodeId: currentNode.id,
      nodeLabel: currentNode.label,
      status,
      output,
    });
    generatedLogs.push(log);

    // Encontra próxima aresta
    if (currentNode.type === "condition") {
      const nextEdge = workflow.edges.find((e) => e.fromNodeId === currentNode!.id && e.branch === branchResult);
      currentNode = nextEdge ? workflow.nodes.find((n) => n.id === nextEdge.toNodeId) : undefined;
    } else {
      const nextEdge = workflow.edges.find((e) => e.fromNodeId === currentNode!.id);
      currentNode = nextEdge ? workflow.nodes.find((n) => n.id === nextEdge.toNodeId) : undefined;
    }
  }

  // Incrementa execuções
  const all = fetchWorkflows(tenantId);
  const updated = all.map((w) => (w.id === workflow.id ? { ...w, executionsCount: w.executionsCount + 1 } : w));
  try {
    localStorage.setItem(`${WORKFLOW_STORAGE_PREFIX}${tenantId}`, JSON.stringify(updated));
  } catch {}

  return { stepsExecuted, branchTaken: branchResult, logs: generatedLogs };
}
