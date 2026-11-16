import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useApp } from '@/lib/store';
import { brl } from '@/lib/pix';
import { seo } from '@/lib/seo';
import { PageHeader } from '@/components/alliar/Shell';
import { useServerFn } from '@tanstack/react-start';
import { useState } from 'react';
import { toast } from 'sonner';
import { HardDrive, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { uploadToDrive } from '@/lib/drive.functions';
function DriveButton({name,content}:{name:string;content:string}){const app=useApp();const up=useServerFn(uploadToDrive);const [busy,setBusy]=useState(false);return <Button size="sm" variant="secondary" disabled={busy||!app.tenantId} onClick={async()=>{setBusy(true);try{const r=await up({data:{tenantId:app.tenantId!,name,content}});if(r.error)toast.error(r.error);else toast.success(`Salvo no Drive ${r.account}`,{action:{label:'Abrir',onClick:()=>window.open(r.link,'_blank')}});}catch(e){toast.error(e instanceof Error?e.message:'Falha ao enviar');}finally{setBusy(false);}}}>{busy?<Loader2 className="mr-1 size-3.5 animate-spin"/>:<HardDrive className="mr-1 size-3.5"/>}Drive</Button>;}
export const Route=createFileRoute('/_authenticated/propostas')({head:()=>seo('Propostas','Consulte as propostas salvas e os valores negociados da sua empresa.'),component:Proposals});
function Proposals(){const app=useApp();const query=useQuery({queryKey:['proposals',app.tenantId],queryFn:async()=>{const {data,error}=await supabase.from('proposals').select('*').eq('tenant_id',app.tenantId??'').order('created_at',{ascending:false}).limit(1000);if(error)throw error;return data;}});return <div className="mx-auto max-w-5xl"><PageHeader title="Propostas"/>{query.isPending?<p>Carregando…</p>:query.error?<p role="alert">Não foi possível carregar as propostas.</p>:!query.data?.length?<p className="text-sm text-muted-foreground">Nenhuma proposta salva. Abra um negócio para criar uma proposta.</p>:<div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b text-muted-foreground"><th className="py-3">Contato</th><th>Valor base</th><th>Desconto</th><th>Total</th><th>Data</th><th></th></tr></thead><tbody>{query.data.map(p=><tr key={p.id} className="border-b"><td className="py-4">{app.leads.find(l=>l.id===p.lead_id)?.name??'Negócio'}</td><td>{brl(p.base)}</td><td>{p.discount}%</td><td className="font-semibold">{brl(p.total??0)}</td><td>{new Date(p.created_at).toLocaleDateString('pt-BR')}</td><td><DriveButton name={`Proposta - ${app.leads.find(l=>l.id===p.lead_id)?.name??'Negócio'} - ${new Date(p.created_at).toLocaleDateString('pt-BR').replace(/\//g,'-')}.txt`} content={`PROPOSTA COMERCIAL\n\nCliente: ${app.leads.find(l=>l.id===p.lead_id)?.name??'Negócio'}\nValor base: ${brl(p.base)}\nDesconto: ${p.discount}%\nTotal: ${brl(p.total??0)}\nData: ${new Date(p.created_at).toLocaleDateString('pt-BR')}\n`}/></td></tr>)}</tbody></table></div>}</div>;}
