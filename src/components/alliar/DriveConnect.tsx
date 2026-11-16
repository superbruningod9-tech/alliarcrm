import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Building2, HardDrive, Loader2, Unplug, User } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/lib/store";
import { completeDriveConnect, disconnectDrive, driveStatus, startDriveConnect } from "@/lib/drive.functions";
import { Button } from "@/components/ui/button";

type Status = Awaited<ReturnType<typeof driveStatus>>;
type Scope = "user" | "tenant";

function waitForCode(popup: Window) {
  return new Promise<string | null>((resolve, reject) => {
    const cleanup = () => { window.removeEventListener("message", onMsg); window.clearInterval(poll); };
    const onMsg = (e: MessageEvent) => {
      const t = e.data?.type;
      if (e.origin !== window.location.origin || e.source !== popup || e.data?.connectorId !== "google_drive" ||
        (t !== "appUserConnectorOAuthComplete" && t !== "appUserConnectorOAuthFailed")) return;
      cleanup();
      if (t === "appUserConnectorOAuthComplete") resolve(typeof e.data.code === "string" ? e.data.code : null);
      else { popup.close(); reject(new Error("A conexão com o Google falhou.")); }
    };
    window.addEventListener("message", onMsg);
    const poll = window.setInterval(() => { if (popup.closed) { cleanup(); reject(new Error("Janela fechada antes de concluir.")); } }, 500);
  });
}

export function DriveConnect() {
  const { tenantId, isAdmin } = useApp();
  const status = useServerFn(driveStatus), start = useServerFn(startDriveConnect), complete = useServerFn(completeDriveConnect), disconnect = useServerFn(disconnectDrive);
  const [s, setS] = useState<Status | null>(null);
  const [busy, setBusy] = useState<Scope | null>(null);
  const load = useCallback(() => { if (tenantId) status({ data: { tenantId } }).then(setS).catch((e) => toast.error(e.message)); }, [tenantId, status]);
  useEffect(load, [load]);

  const connect = async (scope: Scope) => {
    if (!tenantId) return;
    const popup = window.open("", "lovable-oauth", "width=600,height=720");
    if (!popup) return toast.error("Pop-up bloqueado. Permita pop-ups e tente de novo.");
    setBusy(scope);
    try {
      const { authorizationUrl } = await start({ data: { tenantId, scope } });
      const done = waitForCode(popup);
      popup.location.href = authorizationUrl;
      const code = await done;
      if (code) {
        const r = await complete({ data: { tenantId, scope, code } });
        toast.success(`Google Drive ${scope === "user" ? "pessoal" : "da empresa"} conectado${r.email ? ` (${r.email})` : ""}`);
      }
      load();
    } catch (e) { popup.close(); toast.error(e instanceof Error ? e.message : "Falha ao conectar"); }
    finally { setBusy(null); }
  };
  const remove = async (scope: Scope) => {
    if (!tenantId) return;
    setBusy(scope);
    try { await disconnect({ data: { tenantId, scope } }); toast.success("Google Drive desconectado"); load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Falha ao desconectar"); }
    finally { setBusy(null); }
  };

  const Card = ({ scope, title, desc, conn, canEdit, icon: Icon }: { scope: Scope; title: string; desc: string; conn: { email: string | null } | null | undefined; canEdit: boolean; icon: typeof User }) => (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      <div className="flex items-center gap-2"><Icon className="size-4 text-primary" /><h3 className="font-semibold">{title}</h3>
        {s?.active === (scope === "user" ? "personal" : "company") && <span className="ml-auto rounded bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">Em uso</span>}</div>
      <p className="text-xs text-muted-foreground">{desc}</p>
      <p className="text-sm">{s === null ? "Carregando…" : conn ? <>Conectado{conn.email ? <> como <b>{conn.email}</b></> : ""}</> : "Não conectado"}</p>
      {canEdit ? (
        <div className="flex gap-2">
          <Button size="sm" onClick={() => connect(scope)} disabled={busy !== null}>{busy === scope ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : <HardDrive className="mr-1 size-3.5" />}{conn ? "Reconectar" : "Conectar Google Drive"}</Button>
          {conn && <Button size="sm" variant="secondary" onClick={() => remove(scope)} disabled={busy !== null}><Unplug className="mr-1 size-3.5" />Desconectar</Button>}
        </div>
      ) : <p className="text-xs text-muted-foreground">Somente administradores alteram esta conta.</p>}
    </div>
  );

  return (
    <div className="space-y-3">
      <div><h2 className="text-lg font-semibold">Google Drive</h2><p className="text-sm text-muted-foreground">Propostas e arquivos vão para o Drive pessoal do vendedor; se ele não tiver conectado, usam a conta compartilhada da empresa.</p></div>
      <div className="grid gap-3 md:grid-cols-2">
        <Card scope="user" icon={User} title="Minha conta" desc="Seu Drive individual — só você usa." conn={s?.personal} canEdit />
        <Card scope="tenant" icon={Building2} title="Conta da empresa (compartilhada)" desc="Usada por todo o time que não conectou conta própria." conn={s?.company} canEdit={isAdmin} />
      </div>
    </div>
  );
}
