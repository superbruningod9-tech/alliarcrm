import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { toast } from 'sonner';
import { useApp } from '@/lib/store';
import { useAuth } from '@/lib/auth';
import { getB2BStatus, saveB2BConnection, removeB2BConnection } from '@/lib/b2b.functions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
export function B2BSettings() {
 const { tenantId, isAdmin }=useApp(); const {user}=useAuth(); const query=useQueryClient(); const [key,setKey]=useState('');const [busy,setBusy]=useState(false);
 const status=useQuery({queryKey:['b2b-connection',user?.id,tenantId],enabled:!!tenantId&&isAdmin,queryFn:()=>getB2BStatus({data:{tenantId:tenantId??''}})});
 if(!isAdmin||!tenantId)return null;
 const connected=status.data?.some(c=>c.provider==='apollo');
 async function change(remove=false){if(!tenantId)return;setBusy(true);try{if(remove)await removeB2BConnection({data:{tenantId}});else await saveB2BConnection({data:{tenantId,apiKey:key}});setKey('');await query.invalidateQueries({queryKey:['b2b-connection']});toast.success(remove?'Sua conta Apollo foi desconectada.':'Sua conta Apollo foi conectada.');}catch(e){toast.error(e instanceof Error?e.message:'Conexão falhou');}finally{setBusy(false);}}
 return <section className="space-y-4 border-t pt-6"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">Sua conta B2B</h2><Button asChild variant="outline"><Link to="/admin/dashboard">Painel B2B</Link></Button></div><p className="text-sm">Apollo · {connected?'Sua conta conectada nesta empresa':'Não conectada'}</p><p className="text-sm text-muted-foreground">As consultas usam os créditos da sua conta Apollo. Seu plano precisa permitir acesso à API.</p><form className="flex flex-wrap gap-3" onSubmit={e=>{e.preventDefault();void change();}}><Input type="password" aria-label="Sua chave API Apollo" placeholder="Sua chave API Apollo" autoComplete="off" value={key} onChange={e=>setKey(e.target.value)} minLength={8} maxLength={512} required className="max-w-sm"/><Button disabled={busy}>{busy?'Aguarde…':connected?'Substituir chave':'Conectar Apollo'}</Button>{connected&&<Button type="button" variant="outline" disabled={busy} onClick={()=>void change(true)}>Desconectar</Button>}</form>{status.error&&<p role="alert" className="text-destructive">Não foi possível consultar sua conexão.</p>}<p className="text-xs text-muted-foreground">Chave protegida, exclusiva para você nesta empresa. CSV disponível sem conexão.</p></section>;
}
