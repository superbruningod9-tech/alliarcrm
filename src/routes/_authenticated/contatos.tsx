import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Pencil, Trash2, Plus, FileText, Calendar, StickyNote, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useApp } from '@/lib/store';
import { contactSchema } from '@/lib/crm-schemas';
import { seo } from '@/lib/seo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PageHeader } from '@/components/alliar/Shell';

export const Route = createFileRoute('/_authenticated/contatos')({
  head: () => seo('Contatos', 'Cadastre e gerencie os contatos da sua empresa na Alliar.'),
  component: Contacts,
});

function Contacts() {
  const app = useApp();
  const query = useQueryClient();
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // Campos extras editáveis
  const [notes, setNotes] = useState('');
  const [firstContact, setFirstContact] = useState('');
  const [nextFollowUp, setNextFollowUp] = useState('');
  const [nextMeeting, setNextMeeting] = useState('');

  const rows = useQuery({
    queryKey: ['contacts', app.tenantId, page],
    queryFn: async () => {
      const { data, error, count } = await supabase
        .from('contacts')
        .select('*', { count: 'exact' })
        .eq('tenant_id', app.tenantId ?? '')
        .order('name')
        .range(page * 50, page * 50 + 49);
      if (error) throw error;
      return { data, count };
    },
  });

  const contact = rows.data?.data.find((c) => c.id === editing);

  function openEditModal(cId: string | null) {
    setEditing(cId);
    if (cId) {
      const c = rows.data?.data.find((x) => x.id === cId);
      const socios = (c?.socios as Record<string, unknown>) || {};
      setNotes((socios.notes as string) || '');
      setFirstContact((socios.first_contact_at as string) || '');
      setNextFollowUp((socios.next_followup_at as string) || '');
      setNextMeeting((socios.next_meeting_at as string) || '');
    } else {
      setNotes('');
      setFirstContact('');
      setNextFollowUp('');
      setNextMeeting('');
    }
    setOpen(true);
  }

  async function handleOpenClientSheet(contactId: string, contactData: { name: string; company: string; phone: string; email: string }) {
    // Procura se já existe lead vinculado
    const existingLead = app.leads.find((l) => l.contactId === contactId);
    if (existingLead) {
      app.select(existingLead.id);
      return;
    }

    // Se não existir lead ainda para este contato, cria o lead e abre a ficha
    try {
      const leadId = await app.addLead({
        name: contactData.name,
        company: contactData.company || 'Empresa',
        phone: contactData.phone || '',
        email: contactData.email || '',
        value: 0,
      });
      if (leadId) {
        app.select(leadId);
      }
    } catch {
      openEditModal(contactId);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader title="Contatos">
        <Button onClick={() => openEditModal(null)} className="gap-1.5">
          <Plus className="size-4" /> Novo contato
        </Button>
      </PageHeader>

      <Input
        aria-label="Buscar contatos nesta página"
        placeholder="Buscar contato por nome, empresa ou e-mail…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />

      {rows.isPending ? (
        <p className="text-sm text-muted-foreground py-8">Carregando contatos…</p>
      ) : rows.error ? (
        <p role="alert" className="text-sm text-destructive py-8">Não foi possível carregar os contatos.</p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border bg-card shadow-xs">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-muted-foreground text-xs uppercase tracking-wider">
                  <th className="py-3 px-4">Nome</th>
                  <th className="py-3 px-4">Empresa</th>
                  <th className="py-3 px-4">Telefone</th>
                  <th className="py-3 px-4">E-mail</th>
                  <th className="py-3 px-4 text-right">Ações & Ficha</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.data?.data
                  .filter((c) => `${c.name} ${c.company} ${c.email}`.toLowerCase().includes(search.toLowerCase()))
                  .map((c) => (
                    <tr
                      key={c.id}
                      className="hover:bg-muted/30 transition-colors group cursor-pointer"
                      onClick={() => handleOpenClientSheet(c.id, { name: c.name, company: c.company, phone: c.phone, email: c.email })}
                    >
                      <td className="py-3.5 px-4 font-semibold text-foreground">{c.name}</td>
                      <td className="py-3.5 px-4 text-muted-foreground">{c.company || '—'}</td>
                      <td className="py-3.5 px-4 whitespace-nowrap font-mono text-xs text-muted-foreground">{c.phone || '—'}</td>
                      <td className="py-3.5 px-4 text-muted-foreground">{c.email || '—'}</td>
                      <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1 text-xs text-primary border-primary/30 hover:bg-primary/10"
                            onClick={() => handleOpenClientSheet(c.id, { name: c.name, company: c.company, phone: c.phone, email: c.email })}
                            title="Abrir ficha completa e linha do tempo do cliente"
                          >
                            <FileText className="size-3.5" /> Ficha
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            aria-label={`Editar ${c.name}`}
                            onClick={() => openEditModal(c.id)}
                            title="Editar cadastro"
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                            aria-label={`Excluir ${c.name}`}
                            onClick={async () => {
                              if (!window.confirm(`Excluir ${c.name}? Contatos com negócios não podem ser excluídos.`)) return;
                              const { error } = await supabase.from('contacts').delete().eq('tenant_id', app.tenantId ?? '').eq('id', c.id);
                              if (error) toast.error('Contato vinculado a um negócio ou sem permissão.');
                              else {
                                await query.invalidateQueries({ queryKey: ['contacts'] });
                                toast.success('Contato excluído.');
                              }
                            }}
                            title="Excluir contato"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          {!rows.data?.data.length && (
            <p className="py-8 text-sm text-center text-muted-foreground">Nenhum contato cadastrado ainda.</p>
          )}

          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-muted-foreground">Total: {rows.data?.count ?? 0} contatos</span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                Anterior
              </Button>
              <span className="text-xs font-medium">Página {page + 1}</span>
              <Button
                variant="outline"
                size="sm"
                disabled={(page + 1) * 50 >= (rows.data?.count ?? 0)}
                onClick={() => setPage((p) => p + 1)}
              >
                Próxima
              </Button>
            </div>
          </div>
        </>
      )}

      {/* MODAL DE EDIÇÃO COMPLETA DO CONTATO */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Contato & Ficha' : 'Novo Contato'}</DialogTitle>
          </DialogHeader>

          <form
            className="space-y-4 pt-2"
            key={editing ?? 'new'}
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              setBusy(true);
              try {
                const p = contactSchema.parse({ ...Object.fromEntries(f), value: 0 });
                const existingSocios = (contact?.socios as Record<string, unknown>) || {};
                const updatedSocios = {
                  ...existingSocios,
                  notes,
                  first_contact_at: firstContact || null,
                  next_followup_at: nextFollowUp || null,
                  next_meeting_at: nextMeeting || null,
                  updated_at: new Date().toISOString(),
                };

                const data = {
                  name: p.name,
                  company: p.company,
                  phone: p.phone,
                  email: p.email,
                  socios: updatedSocios,
                };

                const r = editing
                  ? await supabase.from('contacts').update(data).eq('tenant_id', app.tenantId ?? '').eq('id', editing)
                  : await supabase.from('contacts').insert({ ...data, tenant_id: app.tenantId ?? '' });

                if (r.error) throw r.error;
                await query.invalidateQueries({ queryKey: ['contacts'] });
                await app.refresh();
                setOpen(false);
                toast.success('Contato e anotações salvos com sucesso!');
              } catch (err) {
                toast.error(err instanceof Error ? err.message : 'Não foi possível salvar');
              } finally {
                setBusy(false);
              }
            }}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block text-xs font-semibold uppercase text-muted-foreground">
                Nome <span className="text-destructive">*</span>
                <Input name="name" required defaultValue={contact?.name ?? ''} maxLength={120} className="mt-1" />
              </label>

              <label className="block text-xs font-semibold uppercase text-muted-foreground">
                Empresa
                <Input name="company" defaultValue={contact?.company ?? ''} maxLength={120} className="mt-1" />
              </label>

              <label className="block text-xs font-semibold uppercase text-muted-foreground">
                Telefone / WhatsApp
                <Input name="phone" defaultValue={contact?.phone ?? ''} maxLength={40} className="mt-1" />
              </label>

              <label className="block text-xs font-semibold uppercase text-muted-foreground">
                E-mail
                <Input name="email" type="email" defaultValue={contact?.email ?? ''} maxLength={254} className="mt-1" />
              </label>
            </div>

            {/* SEÇÃO DE DATAS E AGENDAMENTOS */}
            <div className="rounded-xl border bg-muted/20 p-3 space-y-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Calendar className="size-3.5" /> Datas de Contato & Reunião
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block text-xs text-muted-foreground">
                  Primeiro contato realizado
                  <input
                    type="datetime-local"
                    value={firstContact}
                    onChange={(e) => setFirstContact(e.target.value)}
                    className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-xs"
                  />
                </label>
                <label className="block text-xs text-muted-foreground">
                  Próximo retorno (Follow-up)
                  <input
                    type="datetime-local"
                    value={nextFollowUp}
                    onChange={(e) => setNextFollowUp(e.target.value)}
                    className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-xs"
                  />
                </label>
                <label className="block text-xs text-muted-foreground sm:col-span-2">
                  Agendamento / Remarcação de Reunião
                  <input
                    type="datetime-local"
                    value={nextMeeting}
                    onChange={(e) => setNextMeeting(e.target.value)}
                    className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-xs"
                  />
                </label>
              </div>
            </div>

            {/* SEÇÃO DE ANOTAÇÕES */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <StickyNote className="size-3.5" /> Anotações & Observações do Cliente
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Escreva observações sobre o cliente, preferências, histórico ou combinados..."
                rows={3}
                className="w-full rounded-xl border bg-background p-2.5 text-xs resize-none focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>

            <Button disabled={busy} className="w-full">
              {busy ? 'Salvando…' : 'Salvar Dados do Contato'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
