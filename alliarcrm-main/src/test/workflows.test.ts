import { describe, expect, it } from "vitest";
import {
  PRESET_WORKFLOW_TEMPLATES,
  simulateWorkflowExecution,
  type Workflow,
} from "@/lib/workflows";

describe("construtor visual de automacoes (workflows)", () => {
  it("carrega templates oficiais com gatilhos, ações, delays e condições", () => {
    expect(PRESET_WORKFLOW_TEMPLATES.length).toBeGreaterThanOrEqual(3);
    const tmpl1 = PRESET_WORKFLOW_TEMPLATES[0]!;
    expect(tmpl1.nodes[0]?.type).toBe("trigger");
    expect(tmpl1.nodes.some((n) => n.type === "action")).toBe(true);
    expect(tmpl1.nodes.some((n) => n.type === "delay")).toBe(true);
    expect(tmpl1.nodes.some((n) => n.type === "condition")).toBe(true);
  });

  it("simula execução e segue ramificação condicional SIM", async () => {
    const tmpl = PRESET_WORKFLOW_TEMPLATES[0]!;
    const wf: Workflow = {
      id: "wf-spec-1",
      tenantId: "tenant-spec",
      name: tmpl.name,
      description: tmpl.description,
      active: true,
      nodes: tmpl.nodes,
      edges: tmpl.edges,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      executionsCount: 0,
    };

    const res = await simulateWorkflowExecution({
      tenantId: "tenant-spec",
      workflow: wf,
      lead: { id: "l-1", name: "Clínica Teste", phone: "11999999999", stage: "novo" },
      simulatedBranchChoice: "yes",
    });

    expect(res.stepsExecuted.length).toBeGreaterThanOrEqual(4);
    expect(res.branchTaken).toBe("yes");
    expect(res.logs.some((l) => l.status === "branched_yes")).toBe(true);
  });

  it("simula execução e segue ramificação condicional NÃO (Follow-up Fantasma)", async () => {
    const tmpl = PRESET_WORKFLOW_TEMPLATES[0]!;
    const wf: Workflow = {
      id: "wf-spec-2",
      tenantId: "tenant-spec",
      name: tmpl.name,
      description: tmpl.description,
      active: true,
      nodes: tmpl.nodes,
      edges: tmpl.edges,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      executionsCount: 0,
    };

    const res = await simulateWorkflowExecution({
      tenantId: "tenant-spec",
      workflow: wf,
      lead: { id: "l-2", name: "Cliente Vácuo", phone: "11988888888", stage: "novo" },
      simulatedBranchChoice: "no",
    });

    expect(res.branchTaken).toBe("no");
    expect(res.logs.some((l) => l.status === "branched_no")).toBe(true);
  });
});
