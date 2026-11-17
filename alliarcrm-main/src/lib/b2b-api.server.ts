import { z } from 'zod';
import { b2bRequestContext, enrichB2B, enrichInput, jobsInput, listB2BJobs, metricB2B, tenantInput } from './b2b.server';
export async function handleB2BApi(request:Request, action:'enrich'|'jobs'|'metrics') {
 try {
  const context=await b2bRequestContext(request); const url=new URL(request.url);
  if(action==='enrich') {const length=Number(request.headers.get('content-length')??0);if(length>10000)return Response.json({error:'Lote muito grande'},{status:413});const input=enrichInput.parse(await request.json());return Response.json(await enrichB2B(context,input));}
  const tenantId=url.searchParams.get('tenantId');
  if(action==='metrics'){const input=tenantInput.parse({tenantId});return Response.json(await metricB2B(context,input.tenantId));}
  const input=jobsInput.parse({tenantId,page:Number(url.searchParams.get('page')??1),size:Number(url.searchParams.get('size')??10)});
  return Response.json(await listB2BJobs(context,input));
 }catch(e){const message=e instanceof Error?e.message:'Falha B2B';const status=message==='Unauthorized'?401:e instanceof z.ZodError?400:message.startsWith('Somente')?403:message.startsWith('Conecte')?409:502;return Response.json({error:message},{status});}
}
