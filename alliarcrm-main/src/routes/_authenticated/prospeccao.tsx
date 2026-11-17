import { createFileRoute } from '@tanstack/react-router';
import { B2BDashboard } from '@/components/alliar/B2BDashboard';
import { seo } from '@/lib/seo';
export const Route=createFileRoute('/_authenticated/prospeccao')({head:()=>seo('Prospecção B2B','Enriquecimento real de empresas com sua conta individual e importação CSV no Alliar.'),component:B2BDashboard});
