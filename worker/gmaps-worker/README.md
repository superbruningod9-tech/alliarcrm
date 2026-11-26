# Worker Google Maps (Playwright) — hospedado por você

Roda FORA do Netlify (VPS, Fly.io, Railway, máquina própria). Netlify Functions não executam navegador.

## Aviso importante
Automatizar o Google Maps viola os Termos de Serviço do Google e sofre bloqueios/captcha.
O worker usa atrasos, rotação de User-Agent/viewport, 1 aba por vez e backoff exponencial, mas
**não há garantia de estabilidade**. Use por sua conta e risco; as demais fontes (OSM, site, Receita) não dependem dele.
Os seletores do Google Maps mudam com frequência: espere ajustes. O código não foi testado contra o Google Maps real.

## Uso
```
cd worker/gmaps-worker && npm i && npx playwright install --with-deps chromium
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm start
```
`SUPABASE_SERVICE_ROLE_KEY` fica SOMENTE no ambiente do worker — nunca no repositório nem no Netlify do front.
Antes, aplique `docs/sql/2026-motor-descoberta.sql`. O worker consome `search_jobs` (status `queued`, modo `area`),
percorre as células por Quadtree, grava `search_cells` e insere em `crm_businesses` (+ contatos), isolado por `tenant_id`.

Variáveis opcionais: `MAX_DEPTH` (4), `SATURATION` (18), `MIN_DELAY_MS` (1800), `MAX_DELAY_MS` (4500).
