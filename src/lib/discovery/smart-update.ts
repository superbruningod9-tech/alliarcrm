import {
  type MasterLead,
  type UpdateReport,
  type ConflictDetail,
  type PhoneInfo,
  type SourceName,
} from "./types";
import { haversineMeters } from "./quadtree";
import { nameSimilarity, normName, onlyDigits, isValidCnpj } from "./merge";
import { normalizeBrPhone } from "./phone";
import { calculateCompleteness, buildContactChannels, buildFieldProvenance, enrichSingleLead } from "./enrichment";

export interface SmartMergeOptions {
  preserveManual?: boolean;
  now?: string;
}

/**
 * Verifica se dois leads representam exatamente a MESMA unidade física/estabelecimento.
 * - CNPJ completo idêntico: MESMA unidade.
 * - Mesmo place_id / OSM id na chave: MESMA unidade.
 * - Proximidade geográfica (< 60m) + nome compatível (>= 0.75): MESMA unidade.
 * - IMPORTANTE: Mesmo domínio ou mesma marca NÃO torna filiais diferentes iguais!
 */
export function isSameBusinessUnit(a: MasterLead, b: MasterLead): boolean {
  // 1. Mesmo CNPJ de 14 dígitos (mesma filial/matriz)
  const cnpjA = a.cnpj ? onlyDigits(a.cnpj) : "";
  const cnpjB = b.cnpj ? onlyDigits(b.cnpj) : "";
  if (cnpjA && cnpjB && cnpjA.length === 14 && cnpjB.length === 14) {
    return cnpjA === cnpjB;
  }

  // 2. Mesma chave exata de origem (place ID Google ou node/way OSM)
  if (a.key && b.key && a.key === b.key) {
    return true;
  }

  // 3. Proximidade física + nome muito semelhante
  if (a.lat != null && a.lng != null && b.lat != null && b.lng != null) {
    const distM = haversineMeters({ lat: a.lat, lng: a.lng }, { lat: b.lat, lng: b.lng });
    if (distM < 60) {
      const sim = nameSimilarity(a.name, b.name);
      if (sim >= 0.75) return true;
    }
  }

  // 4. Mesmo endereço exato + nome compatível na mesma cidade
  if (a.city && b.city && normName(a.city) === normName(b.city)) {
    const addrA = a.address ? normName(a.address) : "";
    const addrB = b.address ? normName(b.address) : "";
    if (addrA && addrB && addrA.length > 8 && addrA === addrB) {
      if (nameSimilarity(a.name, b.name) >= 0.7) return true;
    }
  }

  return false;
}

/**
 * Mescla de forma inteligente um lead existente com dados atualizados de uma nova varredura.
 * Aplica a REGRA FUNDAMENTAL: Nunca substitui dado válido por vazio, preserva edições manuais
 * e registra divergências/conflitos.
 */
export function mergeSingleLeadUpdate(
  existing: MasterLead,
  incoming: MasterLead,
  options: SmartMergeOptions = {}
): { updatedLead: MasterLead; fieldsComplemented: number; newContactsCount: number; hasConflict: boolean } {
  const now = options.now || new Date().toISOString();
  let fieldsComplemented = 0;
  let newContactsCount = 0;
  let hasConflict = false;

  const conflicts: Record<string, ConflictDetail> = { ...(existing.conflicts || {}) };
  const manualOverrides = existing.manualOverrides || {};

  // Clone base preservando identidade, IDs e histórico
  const updated: MasterLead = {
    ...existing,
    sources: Array.from(new Set([...existing.sources, ...incoming.sources])),
    fieldSources: { ...(existing.fieldSources || {}) },
    triggers: Array.from(new Set([...existing.triggers, ...(incoming.triggers || [])])),
    lastDiscoveredAt: now,
    lastVerifiedAt: now,
  };

  // Helper para mesclar campos escalares com proteção a dados manuais
  const mergeField = <K extends keyof MasterLead>(
    field: K,
    incomingVal: MasterLead[K],
    incomingSource: string = incoming.sources[0] || "update"
  ) => {
    if (manualOverrides[field as string]) {
      // Se houve edição manual pelo usuário, preserva estritamente o valor atual
      if (incomingVal != null && incomingVal !== "" && incomingVal !== existing[field]) {
        conflicts[field as string] = {
          field: field as string,
          currentValue: existing[field],
          incomingValue: incomingVal,
          incomingSource,
          detectedAt: now,
        };
        hasConflict = true;
      }
      return;
    }

    const curVal = existing[field];
    if ((curVal == null || curVal === "" || (Array.isArray(curVal) && curVal.length === 0)) &&
        incomingVal != null && incomingVal !== "" && (!Array.isArray(incomingVal) || incomingVal.length > 0)) {
      // Campo antes vazio que agora foi complementado!
      (updated as any)[field] = incomingVal;
      fieldsComplemented++;
      updated.fieldSources[field as string] = Array.from(
        new Set([...(updated.fieldSources[field as string] || []), incomingSource as SourceName])
      );
    } else if (incomingVal != null && incomingVal !== "" && incomingVal !== curVal) {
      // Se ambos têm valor válido e a nova fonte traz novidade
      (updated as any)[field] = incomingVal;
      updated.fieldSources[field as string] = Array.from(
        new Set([...(updated.fieldSources[field as string] || []), incomingSource as SourceName])
      );
    }
  };

  // 1. Dados básicos cadastrais
  mergeField("displayName", incoming.displayName);
  mergeField("address", incoming.address);
  mergeField("neighborhood", incoming.neighborhood);
  mergeField("city", incoming.city);
  mergeField("state", incoming.state);
  mergeField("cep", incoming.cep);
  mergeField("website", incoming.website);
  mergeField("rating", incoming.rating);
  mergeField("reviewsCount", incoming.reviewsCount);
  mergeField("openingHours", incoming.openingHours);

  // 2. CNPJ e Perfil Fiscal
  if (!existing.cnpj && incoming.cnpj) {
    updated.cnpj = incoming.cnpj;
    fieldsComplemented++;
  }

  if (incoming.fiscal) {
    if (!existing.fiscal) {
      updated.fiscal = incoming.fiscal;
      fieldsComplemented++;
    } else {
      updated.fiscal = {
        ...existing.fiscal,
        razaoSocial: existing.fiscal.razaoSocial || incoming.fiscal.razaoSocial,
        nomeFantasia: existing.fiscal.nomeFantasia || incoming.fiscal.nomeFantasia,
        situacao: incoming.fiscal.situacao || existing.fiscal.situacao,
        situacaoData: incoming.fiscal.situacaoData || existing.fiscal.situacaoData,
        abertura: existing.fiscal.abertura || incoming.fiscal.abertura,
        idadeAnos: incoming.fiscal.idadeAnos ?? existing.fiscal.idadeAnos,
        porte: incoming.fiscal.porte || existing.fiscal.porte,
        capitalSocial: incoming.fiscal.capitalSocial ?? existing.fiscal.capitalSocial,
        cnaePrincipal: existing.fiscal.cnaePrincipal || incoming.fiscal.cnaePrincipal,
        cnaesSecundarios: existing.fiscal.cnaesSecundarios?.length ? existing.fiscal.cnaesSecundarios : incoming.fiscal.cnaesSecundarios,
        socios: existing.fiscal.socios?.length ? existing.fiscal.socios : incoming.fiscal.socios,
        enderecoCadastral: existing.fiscal.enderecoCadastral || incoming.fiscal.enderecoCadastral,
        isMatriz: incoming.fiscal.isMatriz ?? existing.fiscal.isMatriz,
        tipoUnidade: incoming.fiscal.tipoUnidade || existing.fiscal.tipoUnidade,
      };
    }
  }

  // 3. Mescla Segura de Telefones (União sem perda)
  const phoneMap = new Map<string, PhoneInfo>();
  for (const p of existing.phones) {
    const digits = onlyDigits(p.e164 || p.raw);
    if (digits) phoneMap.set(digits, p);
  }

  for (const p of incoming.phones) {
    const digits = onlyDigits(p.e164 || p.raw);
    if (!digits) continue;
    if (!phoneMap.has(digits)) {
      phoneMap.set(digits, p);
      newContactsCount++;
    } else {
      // Confirma fonte adicional
      const cur = phoneMap.get(digits)!;
      cur.sources = Array.from(new Set([...cur.sources, ...p.sources]));
      cur.confirmed = cur.sources.length >= 2;
      if (p.whatsappLikely) cur.whatsappLikely = true;
    }
  }
  updated.phones = Array.from(phoneMap.values());

  // 4. Mescla Segura de E-mails
  const emailMap = new Map<string, { value: string; sources: SourceName[] }>();
  for (const e of existing.emails) {
    emailMap.set(e.value.toLowerCase(), e);
  }
  for (const e of incoming.emails) {
    const k = e.value.toLowerCase();
    if (!emailMap.has(k)) {
      emailMap.set(k, e);
      newContactsCount++;
    } else {
      const cur = emailMap.get(k)!;
      cur.sources = Array.from(new Set([...cur.sources, ...e.sources]));
    }
  }
  updated.emails = Array.from(emailMap.values());

  // 5. Mescla de Redes Sociais
  updated.socials = { ...(existing.socials || {}) };
  for (const [net, url] of Object.entries(incoming.socials || {})) {
    if (!updated.socials[net] && url) {
      updated.socials[net] = url;
      fieldsComplemented++;
    }
  }

  // 6. Diagnóstico do Website
  if (incoming.siteDiagnosis) {
    updated.siteDiagnosis = {
      ...(existing.siteDiagnosis || {}),
      ...incoming.siteDiagnosis,
      technologies: Array.from(
        new Set([
          ...(existing.siteDiagnosis?.technologies || []),
          ...(incoming.siteDiagnosis.technologies || []),
        ])
      ),
      servicesAndSpecialties: Array.from(
        new Set([
          ...(existing.siteDiagnosis?.servicesAndSpecialties || []),
          ...(incoming.siteDiagnosis.servicesAndSpecialties || []),
        ])
      ),
    };
  }

  // 7. Atualização do Status de Modificação
  const wasChanged = fieldsComplemented > 0 || newContactsCount > 0;
  updated.updateStatus = hasConflict ? "conflito" : wasChanged ? "atualizada" : "inalterada";
  updated.conflicts = conflicts;

  // 8. Recalcular completude e canais com dados unificados
  updated.completeness = calculateCompleteness(updated);
  const channels = buildContactChannels(updated);
  updated.contactChannels = channels;
  updated.contactsDetailed = channels;
  const prov = buildFieldProvenance(updated);
  updated.provenance = prov;
  updated.qualityStatus = prov;

  return { updatedLead: updated, fieldsComplemented, newContactsCount, hasConflict };
}

/**
 * Executa a união e atualização inteligente entre resultados anteriores e nova pesquisa:
 * - Identifica empresas existentes e complementa seus dados.
 * - Adiciona empresas novas.
 * - Identifica novas filiais ligadas a redes já conhecidas.
 * - Preserva empresas anteriores que a nova pesquisa não retornou.
 * - Gera o relatório estatístico detalhado de atualização.
 */
export function smartMergeLeads(
  existingLeads: MasterLead[],
  incomingLeads: MasterLead[],
  options: SmartMergeOptions = {}
): { mergedLeads: MasterLead[]; report: UpdateReport } {
  const now = options.now || new Date().toISOString();
  const matchedExistingKeys = new Set<string>();
  const mergedLeads: MasterLead[] = [];

  let newLeadsCount = 0;
  let updatedLeadsCount = 0;
  let unchangedLeadsCount = 0;
  let newBranchesCount = 0;
  let newContactsCount = 0;
  let complementedFieldsCount = 0;
  let duplicatesAvoided = 0;
  let conflictsCount = 0;

  const newLeadNames: string[] = [];
  const updatedLeadNames: string[] = [];
  const conflictLeadNames: string[] = [];

  // Mapeamento de redes existentes por marca e CNPJ raiz
  const existingBrands = new Map<string, string>(); // normName(brand) -> networkName
  const existingCnpjRoots = new Set<string>();

  for (const l of existingLeads) {
    if (l.brandName) existingBrands.set(normName(l.brandName), l.brandName);
    if (l.cnpjRoot) existingCnpjRoots.add(l.cnpjRoot);
  }

  // 1. Processa cada item vindo da nova pesquisa
  for (const incoming of incomingLeads) {
    // Procura na base existente
    const match = existingLeads.find((ex) => isSameBusinessUnit(ex, incoming));

    if (match) {
      duplicatesAvoided++;
      matchedExistingKeys.add(match.key);

      const mergeResult = mergeSingleLeadUpdate(match, incoming, options);
      mergedLeads.push(mergeResult.updatedLead);

      newContactsCount += mergeResult.newContactsCount;
      complementedFieldsCount += mergeResult.fieldsComplemented;

      if (mergeResult.hasConflict) {
        conflictsCount++;
        conflictLeadNames.push(mergeResult.updatedLead.name);
      }

      if (mergeResult.fieldsComplemented > 0 || mergeResult.newContactsCount > 0) {
        updatedLeadsCount++;
        updatedLeadNames.push(mergeResult.updatedLead.name);
      } else {
        unchangedLeadsCount++;
      }
    } else {
      // Nova unidade física!
      newLeadsCount++;
      newLeadNames.push(incoming.name);

      // Verifica se é uma nova filial de rede já existente
      const normBrand = normName(incoming.brandName || incoming.name);
      const isKnownBrand = existingBrands.has(normBrand);
      const isKnownCnpjRoot = incoming.cnpjRoot ? existingCnpjRoots.has(incoming.cnpjRoot) : false;

      const isBranch = (isKnownBrand || isKnownCnpjRoot || incoming.companyType === "filial");

      if (isBranch) {
        newBranchesCount++;
        incoming.isNetwork = true;
        incoming.relationType = "filial";
        incoming.companyType = incoming.companyType || "filial";
        if (incoming.brandName && !existingBrands.has(normBrand)) {
          existingBrands.set(normBrand, incoming.brandName);
        }
      }

      incoming.updateStatus = "nova";
      incoming.lastDiscoveredAt = now;
      incoming.lastVerifiedAt = now;
      incoming.completeness = calculateCompleteness(incoming);
      const channels = buildContactChannels(incoming);
      incoming.contactChannels = channels;
      incoming.contactsDetailed = channels;
      const prov = buildFieldProvenance(incoming);
      incoming.provenance = prov;
      incoming.qualityStatus = prov;

      mergedLeads.push(incoming);
    }
  }

  // 2. Preserva empresas anteriores que não foram retornadas nesta chamada
  for (const ex of existingLeads) {
    if (!matchedExistingKeys.has(ex.key)) {
      unchangedLeadsCount++;
      // Checa se está desatualizada (> 30 dias)
      const lastCheck = ex.lastVerifiedAt || ex.enrichedAt || ex.lastDiscoveredAt;
      const daysOld = lastCheck
        ? (Date.now() - new Date(lastCheck).getTime()) / (1000 * 60 * 60 * 24)
        : 999;

      const preservedLead: MasterLead = {
        ...ex,
        updateStatus: daysOld > 30 ? "desatualizada" : ex.updateStatus || "inalterada",
      };

      mergedLeads.push(preservedLead);
    }
  }

  const report: UpdateReport = {
    totalSearched: incomingLeads.length,
    newLeadsCount,
    updatedLeadsCount,
    unchangedLeadsCount,
    newBranchesCount,
    newContactsCount,
    complementedFieldsCount,
    duplicatesAvoided,
    conflictsCount,
    failedQueriesCount: 0,
    mode: "full_discovery",
    timestamp: now,
    details: {
      newLeadNames: newLeadNames.slice(0, 10),
      updatedLeadNames: updatedLeadNames.slice(0, 10),
      conflictLeadNames: conflictLeadNames.slice(0, 10),
    },
  };

  return { mergedLeads, report };
}

/**
 * Atualiza os dados de uma única empresa sob demanda, reconsultando fontes e preservando
 * estritamente campos manuais e dados válidos existentes.
 */
export async function refreshSingleLeadData(
  lead: MasterLead,
  options: { forceRefresh?: boolean; googleKey?: string } = {}
): Promise<{ lead: MasterLead; updated: boolean; report: Partial<UpdateReport> }> {
  const now = new Date().toISOString();

  // Enriquecimento com fontes autorizadas
  const freshlyEnriched = await enrichSingleLead(lead, {
    forceRefresh: options.forceRefresh ?? true,
    googleKey: options.googleKey,
  });

  const { updatedLead, fieldsComplemented, newContactsCount, hasConflict } = mergeSingleLeadUpdate(
    lead,
    freshlyEnriched,
    { now }
  );

  const wasUpdated = fieldsComplemented > 0 || newContactsCount > 0;
  updatedLead.lastVerifiedAt = now;
  updatedLead.lastEnrichedAt = now;
  updatedLead.updateStatus = hasConflict ? "conflito" : wasUpdated ? "atualizada" : "inalterada";

  return {
    lead: updatedLead,
    updated: wasUpdated,
    report: {
      updatedLeadsCount: wasUpdated ? 1 : 0,
      unchangedLeadsCount: wasUpdated ? 0 : 1,
      complementedFieldsCount: fieldsComplemented,
      newContactsCount,
      conflictsCount: hasConflict ? 1 : 0,
      timestamp: now,
    },
  };
}
