import { createFileRoute } from '@tanstack/react-router';
import { B2BDashboard } from '@/components/alliar/B2BDashboard';
import { seo } from '@/lib/seo';
export const Route=createFileRoute('/_authenticated/admin/dashboard')({head:()=>seo('B2B Enrichment','Consultas individuais, importação CSV e métricas de empresas no Alliar.'),component:B2BDashboard});
