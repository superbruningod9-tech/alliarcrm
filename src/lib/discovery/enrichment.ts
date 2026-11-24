import type {
  CompletenessReport,
  CompletenessSection,
  ContactChannels,
  FieldMeta,
  FiscalProfile,
  MasterLead,
  PhoneInfo,
  QualityStatus,
  SiteDiagnosis,
  SourceName,
} from "./types";
import { crawlSite } from "./crawler";
import { discoverAndVerifyCnpj } from "./cnpj-discovery";
import { lookupCnpj } from "./receita";
import { normalizeBrPhone } from "./phone";
import { onlyDigits } from "./merge";
import { calculateLeadScores } from "./scoring";

export interface EnrichmentProgress {
  current: number;
  total: number;
  leadKey: string;
  leadName: string;
  cnpjsDiscovered: number;
  whatsappsDiscovered: number;
  sitesCrawled: number;
}

export interface EnrichmentBatchOptions {
  concurrency?: number;
  delayMs?: number;
  forceRefresh?: boolean;
  googleKey?: string;
  onProgress?: (p: EnrichmentProgress) => void;
}

/** Cache em memória para enriquecimentos completos */
const leadEnrichmentCache = new Map<string, { lead: MasterLead; timestamp: number }>();
const ENRICH_CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 dias

/**
 * Calcula o relatório de completude da ficha empresarial (0-100%) em 4 pilares:
 * Identificação, Cadastro Fiscal, Contatos e Presença Digital.
 */
export function calculateCompleteness(lead: MasterLead): CompletenessReport {
  const missingFields: string[] = [];

  // 1. Identificação (Nome, Razão Social, CNPJ, Marca, Tipo de Unidade)
  const idMissing: string[] = [];
  let idPoints = 0;
  if (lead.name || lead.displayName) idPoints += 25; else idMissing.push("Nome fantasia");
  if (lead.fiscal?.razaoSocial) idPoints += 25; else idMissing.push("Razão social");
  if (lead.cnpj || lead.fiscal?.cnpj) idPoints += 30; else idMissing.push("CNPJ");
  if (lead.companyType && lead.companyType !== "desconhecido") idPoints += 20; else idMissing.push("Classificação Matriz/Filial");

  const idSection: CompletenessSection = {
    score: idPoints,
    status: idPoints >= 80 ? "completa" : idPoints >= 50 ? "parcial" : "incompleta",
    missing: idMissing,
  };
  missingFields.push(...idMissing);

  // 2. Cadastro Fiscal (Situação, Data de Abertura, Porte, Capital Social, CNAE, Sócios)
  const fisMissing: string[] = [];
  let fisPoints = 0;
  const f = lead.fiscal;
  if (f?.situacao) fisPoints += 20; else fisMissing.push("Situação cadastral");
  if (f?.abertura) fisPoints += 15; else fisMissing.push("Data de fundação");
  if (f?.porte) fisPoints += 15; else fisMissing.push("Porte da empresa");
  if (f?.capitalSocial != null && f.capitalSocial > 0) fisPoints += 15; else fisMissing.push("Capital social");
  if (f?.cnaePrincipal?.code) fisPoints += 20; else fisMissing.push("CNAE principal");
  if (f?.socios && f.socios.length > 0) fisPoints += 15; else fisMissing.push("Sócios e administradores");

  const fisSection: CompletenessSection = {
    score: fisPoints,
    status: fisPoints >= 70 ? "completa" : fisPoints >= 35 ? "parcial" : "incompleta",
    missing: fisMissing,
  };
  missingFields.push(...fisMissing);

  // 3. Contatos (Telefone fixo/celular, WhatsApp, E-mail comercial)
  const conMissing: string[] = [];
  let conPoints = 0;
  const hasPhone = lead.phones.length > 0;
  const hasWhatsapp = lead.phones.some((p) => p.whatsappLikely) || Boolean(lead.contactsDetailed?.whatsappPhones.length);
  const hasEmail = lead.emails.length > 0 || Boolean(lead.fiscal?.email);

  if (hasPhone) conPoints += 35; else conMissing.push("Telefone principal");
  if (hasWhatsapp) conPoints += 40; else conMissing.push("WhatsApp direto");
  if (hasEmail) conPoints += 25; else conMissing.push("E-mail comercial");

  const conSection: CompletenessSection = {
    score: conPoints,
    status: conPoints >= 75 ? "completa" : conPoints >= 35 ? "parcial" : "incompleta",
    missing: conMissing,
  };
  missingFields.push(...conMissing);

  // 4. Presença Digital (Site, HTTPS, WhatsApp no site, Analytics, Redes Sociais, Google Maps)
  const digMissing: string[] = [];
  let digPoints = 0;
  const hasSite = Boolean(lead.website && lead.siteDiagnosis?.hasSite !== false);
  const isHttps = lead.siteDiagnosis?.https ?? Boolean(lead.website?.startsWith("https://"));
  const hasAnalytics = Boolean(lead.siteDiagnosis?.hasAnalytics);
  const hasSocials = Object.keys(lead.socials || {}).length > 0;
  const hasMaps = lead.sources.includes("google_maps");

  if (hasSite) {
    digPoints += 30;
    if (isHttps) digPoints += 15; else digMissing.push("Certificado HTTPS");
    if (lead.siteDiagnosis?.hasWhatsappLink) digPoints += 15; else digMissing.push("Botão WhatsApp no site");
    if (hasAnalytics) digPoints += 15; else digMissing.push("Pixel/Analytics de conversão");
  } else {
    digMissing.push("Website institucional");
  }

  if (hasSocials) digPoints += 15; else digMissing.push("Redes sociais");
  if (hasMaps) digPoints += 10; else digMissing.push("Perfil Google Maps");

  const digSection: CompletenessSection = {
    score: Math.min(100, digPoints),
    status: digPoints >= 70 ? "completa" : digPoints >= 30 ? "parcial" : "incompleta",
    missing: digMissing,
  };
  missingFields.push(...digMissing);

  const overallScore = Math.round(
    idSection.score * 0.3 + fisSection.score * 0.25 + conSection.score * 0.25 + digSection.score * 0.2
  );

  return {
    overallScore,
    status: overallScore >= 75 ? "completa" : overallScore >= 40 ? "parcial" : "incompleta",
    identification: idSection,
    fiscal: fisSection,
    contact: conSection,
    digital: digSection,
    sections: {
      identification: idSection,
      fiscal: fisSection,
      contact: conSection,
      digital: digSection,
    },
    missingFields,
  };
}

/**
 * Organiza e separa rigorosamente os canais de contato:
 * Telefone fixo, Celular, WhatsApp, E-mail comercial, E-mail de atendimento, Sócios e Redes Sociais.
 */
export function buildContactChannels(
  lead: MasterLead,
  newPhones: string[] = [],
  newEmails: string[] = [],
  newWhatsapp?: string
): ContactChannels {
  const landlinePhones: PhoneInfo[] = [];
  const mobilePhones: PhoneInfo[] = [];
  const whatsappPhones: PhoneInfo[] = [];

  const allRawPhones = [
    ...lead.phones.map((p) => p.e164),
    ...newPhones,
    ...(newWhatsapp ? [newWhatsapp] : []),
    ...(lead.fiscal?.telefones || []),
  ];

  const seenDigits = new Set<string>();

  for (const raw of allRawPhones) {
    const normalized = normalizeBrPhone(raw);
    if (!normalized) continue;
    const digits = onlyDigits(normalized.e164);
    if (seenDigits.has(digits)) continue;
    seenDigits.add(digits);

    const isWa =
      normalized.whatsappLikely ||
      (newWhatsapp && onlyDigits(newWhatsapp).endsWith(digits.slice(-8))) ||
      lead.phones.some((p) => p.whatsappLikely && onlyDigits(p.e164) === digits);

    const phoneInfo: PhoneInfo = {
      ...normalized,
      whatsappLikely: Boolean(isWa),
      sources: lead.fieldSources?.phone || ["site"],
      confirmed: lead.phones.some((p) => onlyDigits(p.e164) === digits && p.confirmed),
    };

    if (normalized.type === "mobile") {
      mobilePhones.push(phoneInfo);
      if (isWa) whatsappPhones.push(phoneInfo);
    } else if (normalized.type === "landline") {
      landlinePhones.push(phoneInfo);
    } else {
      landlinePhones.push(phoneInfo);
    }
  }

  // E-mails separados
  const commercialEmails: ContactChannels["commercialEmails"] = [];
  const supportEmails: ContactChannels["supportEmails"] = [];
  const allEmails = Array.from(
    new Set([
      ...lead.emails.map((e) => e.value.toLowerCase()),
      ...newEmails.map((e) => e.toLowerCase()),
      ...(lead.fiscal?.email ? [lead.fiscal.email.toLowerCase()] : []),
    ])
  );

  for (const email of allEmails) {
    if (/comercial|vendas|contato|orcamento|diretoria|financeiro/i.test(email)) {
      commercialEmails.push({ value: email, sources: ["site"], label: "comercial" });
    } else if (/suporte|sac|atendimento|ajuda/i.test(email)) {
      supportEmails.push({ value: email, sources: ["site"], label: "atendimento" });
    } else {
      commercialEmails.push({ value: email, sources: ["site"], label: "geral" });
    }
  }

  // Contatos de sócios (QSA)
  const personalContacts: ContactChannels["personalContacts"] = (lead.fiscal?.socios || []).map((s) => ({
    name: s.nome,
    role: s.qualificacao || "Sócio / Administrador",
  }));

  const primaryLandline = landlinePhones[0]?.e164 || landlinePhones[0]?.raw;
  const primaryMobile = mobilePhones[0]?.e164 || mobilePhones[0]?.raw;
  const primaryWhatsapp =
    whatsappPhones[0]?.e164 ||
    whatsappPhones[0]?.raw ||
    (newWhatsapp ? normalizeBrPhone(newWhatsapp)?.e164 : undefined) ||
    (lead.phones.find((p) => p.whatsappLikely)?.e164);
  const primaryCommercialEmail = commercialEmails[0]?.value;
  const primarySupportEmail = supportEmails[0]?.value;

  return {
    landlinePhones,
    mobilePhones,
    whatsappPhones,
    landline: primaryLandline,
    mobilePhone: primaryMobile,
    whatsapp: primaryWhatsapp,
    commercialEmail: primaryCommercialEmail,
    supportEmail: primarySupportEmail,
    commercialEmails,
    supportEmails,
    personalContacts,
    officialWebsite: lead.website,
    socials: lead.socials || {},
  };
}

/**
 * Constrói a procedência detalhada por campo com estados:
 * confirmado | encontrado | nao_verificado | nao_encontrado
 */
export function buildFieldProvenance(lead: MasterLead): Record<string, FieldMeta> {
  const prov: Record<string, FieldMeta> = {};
  const now = new Date().toISOString();

  const add = <T>(field: string, val: T, sources: SourceName[], isMissing: boolean) => {
    let status: QualityStatus = "nao_encontrado";
    if (!isMissing && val != null && val !== "") {
      status = sources.length >= 2 ? "confirmado" : "encontrado";
    }
    prov[field] = {
      value: val,
      source: sources[0] || "manual",
      sources,
      status,
      enrichedAt: now,
    };
  };

  add("cnpj", lead.cnpj || lead.fiscal?.cnpj || null, lead.fieldSources?.cnpj || (lead.fiscal ? ["receita"] : []), !lead.cnpj && !lead.fiscal?.cnpj);
  add("razaoSocial", lead.fiscal?.razaoSocial || null, ["receita"], !lead.fiscal?.razaoSocial);
  add("situacaoCadastral", lead.fiscal?.situacao || null, ["receita"], !lead.fiscal?.situacao);
  add("cnaePrincipal", lead.fiscal?.cnaePrincipal?.description || null, ["receita"], !lead.fiscal?.cnaePrincipal);
  add("telefone", lead.phones[0]?.e164 || null, lead.fieldSources?.phone || [], !lead.phones.length);
  add("whatsapp", lead.phones.find((p) => p.whatsappLikely)?.e164 || null, ["site"], !lead.phones.some((p) => p.whatsappLikely));
  add("email", lead.emails[0]?.value || lead.fiscal?.email || null, ["site"], !lead.emails.length && !lead.fiscal?.email);
  add("website", lead.website || null, ["site"], !lead.website);

  return prov;
}

/**
 * Enriquecimento Estruturado Completo de UMA empresa:
 * - Funciona para empresas COM site e SEM site.
 * - Descobre CNPJ público com validação antifalhas.
 * - Executa crawling com diagnóstico profundo se houver site.
 * - Consulta dados cadastrais completos da Receita Federal / BrasilAPI.
 * - Calcula pontuações atualizadas, canais de contato detalhados e relatório de completude.
 */
export async function enrichSingleLead(
  lead: MasterLead,
  options: { forceRefresh?: boolean; googleKey?: string } = {},
  fetchImpl: typeof fetch = fetch
): Promise<MasterLead> {
  // Verificação de cache
  if (!options.forceRefresh) {
    const cached = leadEnrichmentCache.get(lead.key);
    if (cached && Date.now() - cached.timestamp < ENRICH_CACHE_TTL) {
      return cached.lead;
    }
  }

  const enriched: MasterLead = {
    ...lead,
    enrichmentStatus: "processando",
  };

  let newPhones: string[] = [];
  let newEmails: string[] = [];
  let newWhatsapp: string | undefined = undefined;
  let crawledDiagnosis: SiteDiagnosis | undefined = lead.siteDiagnosis;
  let fiscalData: FiscalProfile | undefined = lead.fiscal;
  let identifiedCnpj: string | undefined = lead.cnpj || lead.fiscal?.cnpj;

  // 1. Enriquecimento de Site (se tiver website)
  if (lead.website) {
    try {
      const crawlRes = await crawlSite(lead.website, 4);
      crawledDiagnosis = crawlRes.diagnosis;
      if (crawlRes.record.phones) newPhones.push(...crawlRes.record.phones);
      if (crawlRes.record.emails) newEmails.push(...crawlRes.record.emails);
      if (crawlRes.record.whatsapp?.[0]) newWhatsapp = crawlRes.record.whatsapp[0];
      if (crawlRes.record.socials) {
        enriched.socials = { ...enriched.socials, ...crawlRes.record.socials };
      }
      if (!identifiedCnpj && crawlRes.record.cnpj) {
        identifiedCnpj = crawlRes.record.cnpj;
      }
    } catch (err) {
      console.warn(`[enrichSingleLead] Erro ao rastrear site ${lead.website}:`, err);
    }
  }

  // 2. Descoberta de CNPJ para empresas COM ou SEM site
  if (!identifiedCnpj) {
    try {
      const discResult = await discoverAndVerifyCnpj(
        {
          name: lead.name,
          brandName: lead.brandName,
          city: lead.city,
          state: lead.state,
          cep: lead.cep,
          address: lead.address,
          category: lead.category,
          website: lead.website,
        },
        fetchImpl
      );
      if (discResult) {
        identifiedCnpj = discResult.cnpj;
        fiscalData = discResult.fiscal;
        (enriched.fieldSources ??= {})["cnpj"] = [discResult.source as SourceName];
      }
    } catch (err) {
      console.warn(`[enrichSingleLead] Erro na descoberta de CNPJ para "${lead.name}":`, err);
    }
  }

  // 3. Consulta BrasilAPI se tivermos CNPJ mas ainda faltar perfil fiscal completo
  if (identifiedCnpj && !fiscalData) {
    try {
      const fis = await lookupCnpj(identifiedCnpj, fetchImpl);
      if (fis) fiscalData = fis;
    } catch {}
  }

  // 4. Integração dos dados fiscais
  if (fiscalData) {
    enriched.cnpj = fiscalData.cnpj;
    enriched.fiscal = fiscalData;
    if (fiscalData.telefones?.length) newPhones.push(...fiscalData.telefones);
    if (fiscalData.email) newEmails.push(fiscalData.email);

    // Ajuste de identidade matriz/filial pelo CNPJ
    const cnpjDigits = onlyDigits(fiscalData.cnpj);
    enriched.cnpjRoot = cnpjDigits.slice(0, 8);
    enriched.cnpjBranch = cnpjDigits.slice(8, 12);
    enriched.cnpjDigit = cnpjDigits.slice(12, 14);

    if (fiscalData.isMatriz || enriched.cnpjBranch === "0001") {
      enriched.companyType = "matriz";
      enriched.relationType = "matriz";
    } else {
      enriched.companyType = "filial";
      enriched.relationType = "filial";
      enriched.isNetwork = true;
    }

    if (fiscalData.porte === "ME" || fiscalData.porte === "EPP" || fiscalData.porte === "MEI") {
      enriched.sizeCategory = "pme";
    } else if (fiscalData.porte === "DEMAIS" || (fiscalData.capitalSocial && fiscalData.capitalSocial >= 5_000_000)) {
      enriched.sizeCategory = "grande";
    }
  }

  // 5. Atualização e mescla de Telefones
  const allPhonesCombined = Array.from(
    new Set([
      ...enriched.phones.map((p) => p.e164),
      ...newPhones,
      ...(newWhatsapp ? [newWhatsapp] : []),
    ])
  );

  const updatedPhones: PhoneInfo[] = [];
  const seenDigits = new Set<string>();
  for (const raw of allPhonesCombined) {
    const norm = normalizeBrPhone(raw);
    if (!norm) continue;
    const d = onlyDigits(norm.e164);
    if (seenDigits.has(d)) continue;
    seenDigits.add(d);

    const isWa =
      norm.whatsappLikely ||
      (newWhatsapp && onlyDigits(newWhatsapp).endsWith(d.slice(-8))) ||
      lead.phones.some((p) => p.whatsappLikely && onlyDigits(p.e164) === d);

    updatedPhones.push({
      ...norm,
      whatsappLikely: Boolean(isWa),
      sources: Array.from(new Set([...(enriched.fieldSources?.phone || []), "site"] as SourceName[])),
      confirmed: lead.phones.some((p) => onlyDigits(p.e164) === d && p.confirmed),
    });
  }
  enriched.phones = updatedPhones;

  // 6. Atualização de E-mails
  const allEmailsCombined = Array.from(
    new Set([...enriched.emails.map((e) => e.value.toLowerCase()), ...newEmails.map((e) => e.toLowerCase())])
  );
  enriched.emails = allEmailsCombined.map((val) => ({
    value: val,
    sources: Array.from(new Set([...(lead.emails.find((e) => e.value.toLowerCase() === val)?.sources || []), "site"] as SourceName[])),
  }));

  // 7. Diagnóstico do site
  enriched.siteDiagnosis = crawledDiagnosis;

  // 8. Canais detalhados de contato
  const channels = buildContactChannels(enriched, newPhones, newEmails, newWhatsapp);
  enriched.contactChannels = channels;
  enriched.contactsDetailed = channels;

  // 9. Recalcular Relevância e Potencial Comercial Alliar com os novos dados
  calculateLeadScores(enriched, [enriched.category || enriched.name], [], []);

  // 10. Completude da Ficha e Procedência por Campo
  enriched.completeness = calculateCompleteness(enriched);
  const prov = buildFieldProvenance(enriched);
  enriched.provenance = prov;
  enriched.qualityStatus = prov;
  enriched.enrichmentStatus = "completo";
  enriched.enrichedAt = new Date().toISOString();

  // Salvar no cache em memória
  leadEnrichmentCache.set(lead.key, { lead: enriched, timestamp: Date.now() });

  return enriched;
}

/**
 * Enriquecimento em Lote Estruturado:
 * - Processa TODAS as empresas da pesquisa sem cortes arbitrários.
 * - Controle de concorrência e rate limiting (sem estourar APIs externas).
 * - Notificação de progresso em tempo real.
 * - Tolerância a falhas e continuação de processos interrompidos.
 */
export async function enrichLeadsBatch(
  leads: MasterLead[],
  options: EnrichmentBatchOptions = {},
  fetchImpl: typeof fetch = fetch
): Promise<MasterLead[]> {
  const {
    concurrency = 2,
    delayMs = 250,
    forceRefresh = false,
    googleKey,
    onProgress,
  } = options;

  const results: MasterLead[] = [];
  const total = leads.length;

  let cnpjsDiscovered = 0;
  let whatsappsDiscovered = 0;
  let sitesCrawled = 0;

  for (let i = 0; i < leads.length; i += concurrency) {
    const chunk = leads.slice(i, i + concurrency);

    const chunkResults = await Promise.all(
      chunk.map(async (lead, chunkIndex) => {
        const currentIndex = i + chunkIndex + 1;
        try {
          const hadCnpj = Boolean(lead.cnpj || lead.fiscal?.cnpj);
          const hadWhatsapp = lead.phones.some((p) => p.whatsappLikely);
          const hadSite = Boolean(lead.website);

          const res = await enrichSingleLead(lead, { forceRefresh, googleKey }, fetchImpl);

          if (!hadCnpj && (res.cnpj || res.fiscal?.cnpj)) cnpjsDiscovered++;
          if (!hadWhatsapp && res.phones.some((p) => p.whatsappLikely)) whatsappsDiscovered++;
          if (hadSite && res.siteDiagnosis?.reachable) sitesCrawled++;

          if (onProgress) {
            onProgress({
              current: currentIndex,
              total,
              leadKey: lead.key,
              leadName: lead.displayName || lead.name,
              cnpjsDiscovered,
              whatsappsDiscovered,
              sitesCrawled,
            });
          }

          return res;
        } catch (err) {
          console.warn(`[enrichLeadsBatch] Falha ao enriquecer lead ${lead.name}:`, err);
          return {
            ...lead,
            enrichmentStatus: "erro" as const,
          };
        }
      })
    );

    results.push(...chunkResults);

    // Pausa controlada para respeitar limites de requisição
    if (i + concurrency < leads.length && delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return results;
}
