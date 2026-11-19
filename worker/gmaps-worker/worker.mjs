// Worker Playwright: cobertura máxima do Google Maps via Quadtree + interceptação de rede + fallback DOM.
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY");
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const MAX_DEPTH = +(process.env.MAX_DEPTH ?? 4);
const SATURATION = +(process.env.SATURATION ?? 18);
const MIN_DELAY = +(process.env.MIN_DELAY_MS ?? 1800);
const MAX_DELAY = +(process.env.MAX_DELAY_MS ?? 4500);
const UAS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0",
];
const VIEWPORTS = [{ width: 1366, height: 768 }, { width: 1440, height: 900 }, { width: 1280, height: 800 }];
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = () => sleep(MIN_DELAY + Math.random() * (MAX_DELAY - MIN_DELAY));

const subdivide = (c) => {
  const mLat = (c.lat_min + c.lat_max) / 2, mLng = (c.lng_min + c.lng_max) / 2, d = c.depth + 1;
  return [
    { path: c.path + "0", depth: d, lat_min: mLat, lat_max: c.lat_max, lng_min: c.lng_min, lng_max: mLng },
    { path: c.path + "1", depth: d, lat_min: mLat, lat_max: c.lat_max, lng_min: mLng, lng_max: c.lng_max },
    { path: c.path + "2", depth: d, lat_min: c.lat_min, lat_max: mLat, lng_min: c.lng_min, lng_max: mLng },
    { path: c.path + "3", depth: d, lat_min: c.lat_min, lat_max: mLat, lng_min: mLng, lng_max: c.lng_max },
  ];
};
// zoom adequado ao tamanho da célula (graus de latitude)
const zoomFor = (c) => Math.max(11, Math.min(18, Math.round(Math.log2(360 / Math.max(c.lat_max - c.lat_min, 1e-5)) + 1)));

/** Extrai coordenadas do JSON interceptado (formato interno do Google muda: tratamos de forma defensiva). */
function parsePlacesFromBody(text) {
  const out = [];
  const body = text.replace(/^\)\]\}'\n?/, "");
  const re = /\[null,null,(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)\]/g;
  let m;
  while ((m = re.exec(body))) out.push({ lat: +m[1], lng: +m[2] });
  return out;
}

async function scrapeDom(page) {
  // Fallback por DOM: lista de resultados do painel lateral.
  return page.$$eval('a[href*="/maps/place/"]', (as) => {
    const seen = new Set();
    return as.map((a) => {
      const card = a.closest('div[role="article"]') ?? a.parentElement;
      const txt = card?.innerText ?? "";
      const name = a.getAttribute("aria-label") || txt.split("\n")[0] || "";
      const href = a.getAttribute("href") || "";
      const pid = (href.match(/!1s([^!?]+)/) || [])[1] || href;
      if (!name || seen.has(pid)) return null;
      seen.add(pid);
      const phone = (txt.match(/(?:\+55\s?)?\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}/) || [])[0] || null;
      const rating = parseFloat((txt.match(/(\d[.,]\d)\s*\(/) || [])[1]?.replace(",", ".")) || null;
      const reviews = parseInt((txt.match(/\((\d[\d.]*)\)/) || [])[1]?.replace(/\./g, "")) || null;
      return { place_id: pid, name, phone, rating, reviews, href };
    }).filter(Boolean);
  });
}

async function scrollResults(page, target) {
  const feed = await page.$('div[role="feed"]');
  if (!feed) return;
  let last = 0, stable = 0;
  for (let i = 0; i < 40 && stable < 3; i++) {
    await feed.evaluate((el) => el.scrollBy(0, el.scrollHeight));
    await sleep(700 + Math.random() * 700);
    const n = await page.$$eval('a[href*="/maps/place/"]', (a) => a.length);
    stable = n === last ? stable + 1 : 0; last = n;
    if (n >= target) break;
    if (await page.$('text=/chegou ao fim|end of the list|fim da lista/i')) break;
  }
}

async function openPlaceDetails(page, href) {
  await page.goto(href, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector("h1", { timeout: 10000 }).catch(() => {});
  const txt = async (sel) => (await page.$eval(sel, (e) => e.textContent?.trim()).catch(() => null));
  const attr = async (sel, a) => (await page.$eval(sel, (e, a) => e.getAttribute(a), a).catch(() => null));
  const phone = (await attr('button[data-item-id^="phone:tel:"]', "data-item-id"))?.replace("phone:tel:", "") ?? null;
  const website = await attr('a[data-item-id="authority"]', "href");
  const address = await txt('button[data-item-id="address"]');
  const category = await txt('button[jsaction*="category"]');
  const claimed = !(await page.$("text=/Reivindique este negócio|Claim this business/i"));
  const hours = await page.$$eval('table tr', (rows) => rows.map((r) => r.innerText.replace(/\s+/g, " ").trim()).filter(Boolean)).catch(() => []);
  const wa = await page.$$eval('a[href*="wa.me"], a[href*="api.whatsapp.com"]', (as) => as.map((a) => a.href)).catch(() => []);
  const name = await txt("h1");
  const ratingTxt = await attr('div[role="img"][aria-label*="estrela"], div[role="img"][aria-label*="star"]', "aria-label");
  const rating = parseFloat((ratingTxt?.match(/(\d[.,]\d)/) || [])[1]?.replace(",", ".")) || null;
  return { name, phone, website, address, category, claimed, opening_hours: hours.join(" | ") || null, whatsapp: wa, rating };
}

const isBlocked = async (page) => /sorry\/index|consent\.google|captcha/i.test(page.url()) || !!(await page.$('iframe[src*="recaptcha"]'));

async function searchCell(browser, term, cell) {
  const ctx = await browser.newContext({ userAgent: pick(UAS), viewport: pick(VIEWPORTS), locale: "pt-BR", timezoneId: "America/Sao_Paulo" });
  const page = await ctx.newPage();
  const intercepted = [];
  page.on("response", async (r) => {
    try { if (/\/search\?|tbm=map|\/maps\/preview\/place/.test(r.url())) intercepted.push(...parsePlacesFromBody(await r.text())); } catch {}
  });
  try {
    const lat = (cell.lat_min + cell.lat_max) / 2, lng = (cell.lng_min + cell.lng_max) / 2;
    const url = `https://www.google.com/maps/search/${encodeURIComponent(term)}/@${lat},${lng},${zoomFor(cell)}z?hl=pt-BR`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 35000 });
    if (await isBlocked(page)) throw Object.assign(new Error("blocked"), { blocked: true });
    await page.waitForSelector('div[role="feed"], a[href*="/maps/place/"]', { timeout: 15000 }).catch(() => {});
    await scrollResults(page, SATURATION + 10);
    const list = await scrapeDom(page);
    const results = [];
    for (const item of list.slice(0, SATURATION + 10)) {
      await jitter();
      try {
        const d = await openPlaceDetails(page, item.href);
        const c = (item.href.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/) || []);
        results.push({ ...item, ...d, lat: c[1] ? +c[1] : null, lng: c[2] ? +c[2] : null });
      } catch { results.push(item); }
      if (await isBlocked(page)) throw Object.assign(new Error("blocked"), { blocked: true });
    }
    return { count: list.length, results, interceptedCoords: intercepted.length };
  } finally { await ctx.close(); }
}

async function withBackoff(fn, tries = 4) {
  let delay = 15000;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); }
    catch (e) { if (!e.blocked || i === tries - 1) throw e; console.warn(`bloqueio detectado; aguardando ${delay / 1000}s`); await sleep(delay); delay *= 2; }
  }
}

const e164 = (p) => {
  if (!p) return null;
  let d = p.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "").replace(/^0+/, "");
  return d.length === 10 || d.length === 11 ? "+55" + d : null;
};

async function saveBusiness(job, r) {
  const phone = e164(r.phone);
  let host = null;
  try { host = r.website ? new URL(r.website).hostname.replace(/^www\./, "") : null; } catch {}
  const key = host ?? `${(r.name ?? "").toLowerCase()}|${r.place_id}`;
  const { data: b, error } = await sb.from("crm_businesses").upsert({
    tenant_id: job.tenant_id, user_id: job.user_id, job_id: job.id, merge_key: key.slice(0, 300), name: (r.name ?? "").slice(0, 300),
    category: r.category ?? null, address: r.address ?? null, lat: r.lat ?? null, lng: r.lng ?? null, website: r.website ?? null,
    rating: r.rating ?? null, reviews_count: r.reviews ?? null, claimed: r.claimed ?? null, opening_hours: r.opening_hours ?? null,
    sources: ["google_maps"], field_sources: { phone: phone ? ["google_maps"] : [] },
    triggers: [!r.website && "Não possui site", r.claimed === false && "Perfil do Google não reivindicado", r.rating && r.rating < 4 && `Avaliação baixa no Maps (${r.rating})`].filter(Boolean),
    updated_at: new Date().toISOString(),
  }, { onConflict: "tenant_id,merge_key" }).select("id").single();
  if (error || !b) return;
  const contacts = [];
  if (phone) contacts.push({ kind: "phone", value: phone, label: phone[5] === "9" ? "mobile" : "landline", whatsapp: phone[5] === "9", sources: ["google_maps"] });
  for (const w of r.whatsapp ?? []) { const n = e164(w.replace(/.*(?:phone=|wa\.me\/)/, "")); if (n) contacts.push({ kind: "phone", value: n, label: "whatsapp", whatsapp: true, sources: ["google_maps"] }); }
  if (contacts.length) await sb.from("lead_contacts").upsert(contacts.map((c) => ({ ...c, tenant_id: job.tenant_id, business_id: b.id })), { onConflict: "business_id,kind,value" });
}

async function runJob(browser, job) {
  const terms = job.expanded_terms?.length ? job.expanded_terms : job.niches;
  const a = job.area;
  const root = a.type === "circle"
    ? { lat_min: a.center.lat - a.radiusKm / 111.32, lat_max: a.center.lat + a.radiusKm / 111.32, lng_min: a.center.lng - a.radiusKm / (111.32 * Math.cos((a.center.lat * Math.PI) / 180)), lng_max: a.center.lng + a.radiusKm / (111.32 * Math.cos((a.center.lat * Math.PI) / 180)) }
    : a.bbox;
  await sb.from("search_jobs").update({ status: "running" }).eq("id", job.id);
  const queue = terms.map((t) => ({ term: t, cell: { path: "r", depth: 0, ...root } }));
  const seen = new Set(); let done = 0, total = queue.length;
  while (queue.length) {
    const { term, cell } = queue.shift();
    const { data: cur } = await sb.from("search_jobs").select("status").eq("id", job.id).single();
    if (cur?.status === "canceled") return;
    try {
      const res = await withBackoff(() => searchCell(browser, term, cell));
      for (const r of res.results) { const k = r.place_id || r.name; if (seen.has(k) || !r.name) continue; seen.add(k); await saveBusiness(job, r); }
      const saturated = res.count >= SATURATION;
      await sb.from("search_cells").insert({ job_id: job.id, tenant_id: job.tenant_id, cell_path: cell.path, depth: cell.depth, lat_min: cell.lat_min, lng_min: cell.lng_min, lat_max: cell.lat_max, lng_max: cell.lng_max, term, status: saturated && cell.depth < MAX_DEPTH ? "saturated" : "done", results_count: res.count });
      if (saturated && cell.depth < MAX_DEPTH) { for (const c of subdivide(cell)) queue.push({ term, cell: c }); total += 4; }
    } catch (e) {
      await sb.from("search_cells").insert({ job_id: job.id, tenant_id: job.tenant_id, cell_path: cell.path, depth: cell.depth, lat_min: cell.lat_min, lng_min: cell.lng_min, lat_max: cell.lat_max, lng_max: cell.lng_max, term, status: "failed", error: String(e.message).slice(0, 300) });
    }
    done++;
    await sb.from("search_jobs").update({ progress: Math.min(99, Math.round((done / total) * 100)), total_found: seen.size }).eq("id", job.id);
    await jitter();
  }
  await sb.from("search_jobs").update({ status: "done", progress: 100, total_found: seen.size, finished_at: new Date().toISOString() }).eq("id", job.id);
}

const browser = await chromium.launch({ headless: true });
process.on("SIGINT", async () => { await browser.close(); process.exit(0); });
console.log("worker iniciado");
for (;;) {
  const { data: job } = await sb.from("search_jobs").select("*").eq("status", "queued").eq("mode", "area").order("created_at").limit(1).maybeSingle();
  if (!job) { await sleep(10000); continue; }
  try { await runJob(browser, job); }
  catch (e) { await sb.from("search_jobs").update({ status: "failed", error: String(e.message).slice(0, 300) }).eq("id", job.id); }
}
