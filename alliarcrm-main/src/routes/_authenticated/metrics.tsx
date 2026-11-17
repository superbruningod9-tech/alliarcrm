import { createFileRoute } from '@tanstack/react-router';
import { B2BDashboard } from '@/components/alliar/B2BDashboard';
import { seo } from '@/lib/seo';
export const Route=createFileRoute('/_authenticated/metrics')({head:()=>seo('Métricas B2B','Métricas de processamento de empresas da sua conta no Alliar.'),component:B2BDashboard});
