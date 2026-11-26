import { createFileRoute } from "@tanstack/react-router";
import { seo } from "@/lib/seo";
import { DiscoveryPage } from "@/routes/_authenticated/descoberta";

export const Route = createFileRoute("/_authenticated/prospeccao")({
  head: () => seo(
    "Prospecção Ativa B2B · Alliar CRM",
    "Busque empresas reais pelo Google Maps e por CNPJ — importe direto para o funil com dados verificados da Receita Federal."
  ),
  component: ProspeccaoPage,
});

function ProspeccaoPage() {
  // Unified UI – just render the same DiscoveryPage used by /descoberta
  return <DiscoveryPage />;
}
