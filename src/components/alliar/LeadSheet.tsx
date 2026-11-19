import { useEffect, useState } from "react";
import {
  FileText,
  MessageCircle,
  Mic,
  Phone,
  QrCode,
  StickyNote,
  Eye,
  Pencil,
  Save,
  X,
  Calendar,
  Clock,
  UserCheck,
  Building2,
  DollarSign,
  Thermometer,
  ArrowUpDown,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useApp, STAGES, type Lead } from "@/lib/store";
import { brl } from "@/lib/pix";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { VoiceButton } from "./Voice";
import { PixDialog } from "./PixDialog";
import { TempBadge } from "./Badges";

const ICON = { msg: MessageCircle, call: Phone, proposta: FileText, audio: Mic, pix: QrCode, nota: StickyNote };

export function LeadSheet() {
  const { leads, selected, select, addEvent, updateLead, tenantId } = useApp();
  const [pix, setPix] = useState(false);

  // Edit mode
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editCompany, setEditCompany] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editValue, setEditValue] = useState("");
  const [editTemp, setEditTemp] = useState<Lead["temp"]>("morno");
  const [editPriority, setEditPriority] = useState<Lead["priority"]>("média");
  const [editStage, setEditStage] = useState<Lead["stage"]>("novo");

  // Date fields
  const [firstContact, setFirstContact] = useState("");
  const [lastContactDate, setLastContactDate] = useState("");
  const [nextFollowUp, setNextFollowUp] = useState("");
  const [nextMeeting, setNextMeeting] = useState("");

  // Notes
  const [notes, setNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    const h = () => setPix(true);
    window.addEventListener("alliar:pix", h);
    return () => window.removeEventListener("alliar:pix", h);
  }, []);

  const lead = leads.find((l) => l.id === selected);

  function toDateTimeLocal(iso?: string | null) {
    if (!iso) return "";
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return "";
      return d.toISOString().slice(0, 16);
    } catch {
      return "";
    }
  }

  // Carrega os dados quando o lead selecionado muda
  useEffect(() => {
    if (!lead || !tenantId) return;
    setEditName(lead.name);
    setEditCompany(lead.company);
    setEditPhone(lead.phone);
    setEditValue(String(lead.value));
    setEditTemp(lead.temp);
    setEditPriority(lead.priority);
    setEditStage(lead.stage);
    setEditing(false);

    // Data do último contato a partir do lead.updatedAt
    setLastContactDate(toDateTimeLocal(lead.updatedAt));

    // Carrega dados persistidos do contato no banco (campo socios JSON)
    if (lead.contactId) {
      void supabase
        .from("contacts")
        .select("socios")
        .eq("id", lead.contactId)
        .maybeSingle()
        .then(({ data }) => {
          const socios = (data?.socios as Record<string, unknown>) || {};
          if (socios.notes) setNotes(String(socios.notes));
          else {
            // Tenta obter da timeline caso haja nota gravada
            const lastNote = lead.timeline.find((t) => t.kind === "nota");
            if (lastNote) setNotes(lastNote.text.replace(/^📋 Anotação:\s*/, ""));
            else setNotes("");
          }
          if (socios.first_contact_at) setFirstContact(toDateTimeLocal(String(socios.first_contact_at)));
          else setFirstContact(toDateTimeLocal(lead.createdAt));

          if (socios.next_followup_at) setNextFollowUp(toDateTimeLocal(String(socios.next_followup_at)));
          if (socios.next_meeting_at) setNextMeeting(toDateTimeLocal(String(socios.next_meeting_at)));
        });
    }
  }, [lead?.id]);

  if (!lead) return null;

  async function handleSaveNotesAndDates() {
    if (!lead || !tenantId) return;
    setSavingNotes(true);
    try {
      // 1. Atualiza os dados persistidos no contato (campo socios JSON suporta metadados com segurança)
      if (lead.contactId) {
        const { data: contactRow } = await supabase
          .from("contacts")
          .select("socios")
          .eq("id", lead.contactId)
          .maybeSingle();

        const currentSocios = (contactRow?.socios as Record<string, unknown>) || {};
        const updatedSocios = {
          ...currentSocios,
          notes,
          first_contact_at: firstContact ? new Date(firstContact).toISOString() : null,
          next_followup_at: nextFollowUp ? new Date(nextFollowUp).toISOString() : null,
          next_meeting_at: nextMeeting ? new Date(nextMeeting).toISOString() : null,
          last_contact_at: lastContactDate ? new Date(lastContactDate).toISOString() : new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        const { error: ce } = await supabase
          .from("contacts")
          .update({ socios: updatedSocios })
          .eq("id", lead.contactId);
        if (ce) console.warn("Aviso ao salvar metadados do contato:", ce);
      }

      // 2. Atualiza updated_at do lead no banco de dados para refletir data do último contato
      const targetDate = lastContactDate ? new Date(lastContactDate).toISOString() : new Date().toISOString();
      await supabase
        .from("leads")
        .update({ updated_at: targetDate })
        .eq("id", lead.id);

      // 3. Registra na linha do tempo (lead_events) para histórico permanente
      if (notes.trim()) {
        await addEvent(lead.id, {
          kind: "nota",
          text: `📋 Anotação: ${notes.trim().slice(0, 300)}`,
        });
      }

      if (nextFollowUp) {
        await addEvent(lead.id, {
          kind: "nota",
          text: `⏰ Próximo retorno agendado para: ${new Date(nextFollowUp).toLocaleString("pt-BR")}`,
        });
      }

      if (nextMeeting) {
        await addEvent(lead.id, {
          kind: "nota",
          text: `📅 Reunião agendada/remarcada para: ${new Date(nextMeeting).toLocaleString("pt-BR")}`,
        });
      }

      toast.success("Ficha, anotações e datas salvas com sucesso!");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar dados");
    } finally {
      setSavingNotes(false);
    }
  }

  async function handleSaveEdit() {
    if (!lead || !tenantId) return;
    setSavingEdit(true);
    try {
      // 1. Atualiza dados do contato (nome, empresa, telefone)
      if (lead.contactId) {
        const { error: ce } = await supabase
          .from("contacts")
          .update({
            name: editName.trim(),
            company: editCompany.trim(),
            phone: editPhone.trim(),
          })
          .eq("id", lead.contactId);
        if (ce) throw ce;
      }

      // 2. Atualiza dados cadastrais do negócio (etapa, valor, temperatura, prioridade)
      await updateLead(lead.id, {
        stage: editStage,
        value: Number(editValue) || 0,
        temp: editTemp,
        priority: editPriority,
      });

      toast.success("Dados cadastrais do cliente atualizados!");
      setEditing(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao atualizar dados");
    } finally {
      setSavingEdit(false);
    }
  }

  return (
    <>
      <Sheet open={!!lead && !pix} onOpenChange={(o) => !o && select(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <div className="flex items-center justify-between pb-2 border-b">
              <div>
                {editing ? (
                  <div className="space-y-1">
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="Nome do contato"
                      className="text-base font-semibold h-8 w-56"
                    />
                    <Input
                      value={editCompany}
                      onChange={(e) => setEditCompany(e.target.value)}
                      placeholder="Nome da empresa"
                      className="text-xs h-7 w-56 text-muted-foreground"
                    />
                  </div>
                ) : (
                  <>
                    <SheetTitle className="text-left text-lg font-bold">{lead.name}</SheetTitle>
                    <p className="text-left text-xs text-muted-foreground mt-0.5">
                      {lead.company || "Empresa B2B"} · {lead.phone || "Sem telefone"}
                    </p>
                  </>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                {editing ? (
                  <>
                    <Button size="sm" variant="default" onClick={handleSaveEdit} disabled={savingEdit} className="gap-1 h-8 text-xs">
                      <Save className="size-3.5" /> {savingEdit ? "Salvando…" : "Salvar Edição"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(false)} className="h-8 size-8 p-0">
                      <X className="size-4" />
                    </Button>
                  </>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => setEditing(true)} className="gap-1.5 h-8 text-xs">
                    <Pencil className="size-3.5" /> Editar Cadastro
                  </Button>
                )}
              </div>
            </div>
          </SheetHeader>

          <div className="space-y-5 px-4 pb-6 mt-4">
            {/* CARDS COM MÉTRICAS DO NEGÓCIO */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl border bg-muted/30 p-2.5">
                <div className="text-[10px] uppercase font-semibold text-muted-foreground">Valor</div>
                {editing ? (
                  <Input
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    type="number"
                    className="text-xs h-7 text-center font-bold mt-1"
                  />
                ) : (
                  <div className="text-sm font-bold text-foreground mt-0.5">{brl(lead.value)}</div>
                )}
              </div>

              <div className="rounded-xl border bg-muted/30 p-2.5">
                <div className="text-[10px] uppercase font-semibold text-muted-foreground">Etapa do Funil</div>
                {editing ? (
                  <select
                    value={editStage}
                    className="w-full rounded border bg-background text-xs p-1 mt-1 font-medium"
                    onChange={(e) => setEditStage(e.target.value as Lead["stage"])}
                  >
                    {STAGES.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="text-xs font-semibold text-foreground mt-1 truncate">
                    {STAGES.find((s) => s.id === lead.stage)?.label}
                  </div>
                )}
              </div>

              <div className="flex flex-col items-center justify-center rounded-xl border bg-muted/30 p-2.5">
                <div className="text-[10px] uppercase font-semibold text-muted-foreground">Temperatura</div>
                {editing ? (
                  <select
                    value={editTemp}
                    className="w-full rounded border bg-background text-xs p-1 mt-1 font-medium"
                    onChange={(e) => setEditTemp(e.target.value as Lead["temp"])}
                  >
                    <option value="quente">🔥 Quente</option>
                    <option value="morno">🌤 Morno</option>
                    <option value="frio">❄️ Frio</option>
                  </select>
                ) : (
                  <div className="mt-1">
                    <TempBadge t={lead.temp} />
                  </div>
                )}
              </div>
            </div>

            {/* EDIÇÃO DE CAMPOS EXTRAS (QUANDO EM MODO EDIÇÃO) */}
            {editing && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-xl border bg-muted/10 animate-in fade-in duration-150">
                <label className="block text-xs font-medium text-foreground">
                  Telefone / WhatsApp
                  <Input
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    placeholder="+55 11 99999-9999"
                    className="mt-1 h-8 text-xs font-mono"
                  />
                </label>

                <label className="block text-xs font-medium text-foreground">
                  Prioridade Comercial
                  <select
                    value={editPriority}
                    className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-xs font-medium"
                    onChange={(e) => setEditPriority(e.target.value as Lead["priority"])}
                  >
                    <option value="alta">🔴 Alta Prioridade</option>
                    <option value="média">🟡 Média Prioridade</option>
                    <option value="baixa">🟢 Baixa Prioridade</option>
                  </select>
                </label>
              </div>
            )}

            {lead.proposalOpen && (
              <div className="flex items-center gap-2 rounded-xl border border-info/40 bg-info/10 p-2.5 text-xs text-info font-medium">
                <Eye className="size-4 shrink-0" />
                Radar ativo: o cliente está visualizando a proposta comercial neste momento!
              </div>
            )}

            {/* ATALHOS RÁPIDOS DO NEGÓCIO */}
            {!editing && (
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" onClick={() => setPix(true)} className="gap-1 text-xs">
                  <QrCode className="size-3.5" /> Proposta + PIX
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  className="gap-1 text-xs"
                  onClick={() => {
                    updateLead(lead.id, { stage: "contato" });
                    addEvent(lead.id, { kind: "nota", text: "Retorno realizado e registrado." });
                  }}
                >
                  Em Contato
                </Button>
                <label className="flex items-center text-xs font-medium ml-auto">
                  Mudar Etapa:
                  <select
                    aria-label="Etapa do negócio"
                    value={lead.stage}
                    className="ml-2 rounded-md border bg-background px-2 py-1 text-xs"
                    onChange={(e) => updateLead(lead.id, { stage: e.target.value as Lead["stage"] })}
                  >
                    {STAGES.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
                <VoiceButton onText={(t) => addEvent(lead.id, { kind: "audio", text: `Resumo de voz: ${t}` })} />
              </div>
            )}

            {/* SEÇÃO 1: DATAS DE CONTATO E AGENDAMENTOS (TOTALMENTE EDITÁVEIS) */}
            <div className="rounded-2xl border bg-card p-4 space-y-3.5 shadow-2xs">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                  <Calendar className="size-3.5 text-primary" /> Datas, Retornos & Reuniões
                </h3>
                <span className="text-[11px] text-muted-foreground">Atualização livre</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">Data/Hora do Primeiro Contato:</span>
                  <input
                    type="datetime-local"
                    value={firstContact}
                    onChange={(e) => setFirstContact(e.target.value)}
                    className="mt-1 w-full rounded-lg border bg-background px-2.5 py-1.5 text-xs focus:ring-1 focus:ring-primary"
                  />
                </label>

                <label className="block text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">Data/Hora do Último Contato:</span>
                  <input
                    type="datetime-local"
                    value={lastContactDate}
                    onChange={(e) => setLastContactDate(e.target.value)}
                    className="mt-1 w-full rounded-lg border bg-background px-2.5 py-1.5 text-xs focus:ring-1 focus:ring-primary"
                  />
                </label>

                <label className="block text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">Próximo Retorno Previsto (Follow-up):</span>
                  <input
                    type="datetime-local"
                    value={nextFollowUp}
                    onChange={(e) => setNextFollowUp(e.target.value)}
                    className="mt-1 w-full rounded-lg border bg-background px-2.5 py-1.5 text-xs focus:ring-1 focus:ring-primary"
                  />
                </label>

                <label className="block text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">Agendamento / Remarcação de Reunião:</span>
                  <input
                    type="datetime-local"
                    value={nextMeeting}
                    onChange={(e) => setNextMeeting(e.target.value)}
                    className="mt-1 w-full rounded-lg border bg-background px-2.5 py-1.5 text-xs focus:ring-1 focus:ring-primary"
                  />
                </label>
              </div>
            </div>

            {/* SEÇÃO 2: CAMPO DE ANOTAÇÕES PERSISTENTE */}
            <div className="rounded-2xl border bg-card p-4 space-y-3 shadow-2xs">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                  <StickyNote className="size-3.5 text-amber-500" /> Anotações & Observações do Cliente
                </h3>
                <span className="text-[11px] text-muted-foreground">Salvo no banco</span>
              </div>

              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Escreva detalhes sobre o cliente, objeções apresentadas, perfil decisor, combinados comerciais e preferências..."
                rows={4}
                className="w-full rounded-xl border bg-background p-3 text-xs resize-none focus:outline-none focus:ring-2 focus:ring-primary/20 leading-relaxed"
              />

              <div className="flex justify-end">
                <Button
                  size="sm"
                  disabled={savingNotes}
                  onClick={handleSaveNotesAndDates}
                  className="gap-1.5 h-8 text-xs font-semibold"
                >
                  <Save className="size-3.5" />
                  {savingNotes ? "Salvando no Banco…" : "Salvar Anotações & Datas"}
                </Button>
              </div>
            </div>

            {/* SEÇÃO 3: RAIO-X / LINHA DO TEMPO */}
            <div>
              <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Linha do Tempo & Histórico
              </h3>
              <ol className="relative space-y-4 border-l pl-5">
                {[...lead.timeline].reverse().map((e, i) => {
                  const I = ICON[e.kind];
                  return (
                    <li key={i} className="relative">
                      <span className="absolute -left-[29px] grid size-6 place-items-center rounded-full border bg-card shadow-2xs">
                        <I className="size-3 text-primary" />
                      </span>
                      <p className="text-sm font-medium text-foreground">{e.text}</p>
                      <p className="text-xs text-muted-foreground">{e.at}</p>
                    </li>
                  );
                })}
              </ol>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <PixDialog lead={lead} open={pix} onOpenChange={setPix} />
    </>
  );
}
