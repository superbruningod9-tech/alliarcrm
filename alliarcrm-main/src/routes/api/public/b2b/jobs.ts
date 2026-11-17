import { createFileRoute } from '@tanstack/react-router';
export const Route=createFileRoute('/api/public/b2b/jobs')({server:{handlers:{GET:async ({request})=>(await import('@/lib/b2b-api.server')).handleB2BApi(request,'jobs')}}});
