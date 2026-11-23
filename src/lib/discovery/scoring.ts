import type { MasterLead } from "./types";
import { normName, onlyDigits } from "./merge";

export type SortMode =
  | "recomendada"
  | "relevancia"
  | "potencial"
  | "porte"
  | "redes"
  | "independentes"
  | "completude"
  | "recentes";

/**
 * 1. PONTUAÇÃO DE RELEVÂNCIA PARA O NICHO (0 - 100)
 * Mede a aderência real à categoria e aos termos pesquisados,
 * sem penalizar empresas pequenas por terem menos reviews ou menos dados públicos,
 * e sem inflar grandes marcas apenas por popularidade.
 */
export function calculateRelevanceScore(
  lead: MasterLead,
  targetTerms: string[],
  relatedCategories: string[] = [],
  cnaes: string[] = []
): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 30; // Pontuação base por ter sido encontrada na área geográfica do nicho

  const normTerms = targetTerms.map(normName).filter(Boolean);
  const normRelated = relatedCategories.map(normName).filter(Boolean);

  const cleanName = normName(lead.name || "");
  const cleanBrand = normName(lead.brandName || "");
  const cleanCategory = normName(lead.category || "");
  const allCategories = (lead.categories || []).map(normName);
  const cnaeCode = onlyDigits(lead.fiscal?.cnaePrincipal?.code);
  const cnaeDesc = normName(lead.fiscal?.cnaePrincipal?.description || "");

  // 1. Correspondência direta no Nome ou Marca
  const directNameMatch = normTerms.find((t) => cleanName.includes(t) || cleanBrand.includes(t));
  if (directNameMatch) {
    score += 40;
    reasons.push(`Nome da empresa "${lead.brandName || lead.name}" contém o termo exato "${directNameMatch}".`);
  }

  // 2. Correspondência na Categoria (Google Places / OpenStreetMap)
  const directCategoryMatch = normTerms.find(
    (t) => cleanCategory.includes(t) || allCategories.some((c) => c.includes(t))
  );
  if (directCategoryMatch) {
    score += 35;
    reasons.push(`Classificação cadastral do mapa corresponde ao nicho ("${directCategoryMatch}").`);
  } else if (lead.category) {
    score += 15;
    reasons.push(`Categoria mapeada como "${lead.category}".`);
  }

  // 3. Correspondência em CNAE Fiscal da Receita Federal
  const cnaeMatch = cnaes.some((c) => cnaeCode.startsWith(onlyDigits(c).slice(0, 4)));
  const cnaeTermMatch = normTerms.find((t) => cnaeDesc.includes(t));
  if (cnaeMatch || cnaeTermMatch) {
    score += 20;
    reasons.push(`CNAE oficial registrado na Receita Federal é compatível com o nicho (${lead.fiscal?.cnaePrincipal?.code || "CNAE compatível"}).`);
  }

  // 4. Correspondência com Categoria Relacionada (quando não houver match direto)
  if (!directNameMatch && !directCategoryMatch) {
    const relatedMatch = normRelated.find(
      (r) => cleanName.includes(r) || cleanCategory.includes(r) || allCategories.some((c) => c.includes(r))
    );
    if (relatedMatch) {
      score += 25;
      reasons.push(`Atividade compatível com vertente relacionada ("${relatedMatch}").`);
    }
  }

  // Se não tiver nenhum motivo explícito, justificar com base geográfica
  if (reasons.length === 0) {
    reasons.push("Estabelecimento localizado na delimitação geográfica da busca com atividade correlata.");
  }

  const finalScore = Math.max(20, Math.min(100, score));
  return { score: finalScore, reasons };
}

/**
 * 2. PONTUAÇÃO DE POTENCIAL COMERCIAL ALLIAR (0 - 100)
 * Mede as oportunidades concretas para os serviços da Alliar
 * (Criação de Sites, Tráfego Pago, Google Meu Negócio, Identidade Visual, WhatsApp e Geração de Leads),
 * cruzando dados públicos com necessidades reais de marketing e vendas.
 */
export function calculateCommercialScore(
  lead: MasterLead
): { score: number; reasons: string[]; serviceOpportunities: string[] } {
  let score = 25; // Base de oportunidade
  const reasons: string[] = [];
  const serviceOpportunities: string[] = [];

  const diag = lead.siteDiagnosis;
  const hasPhone = lead.phones.length > 0;
  const hasWhatsapp = lead.phones.some((p) => p.whatsappLikely);
  const hasEmail = lead.emails.length > 0;

  // 1. Oportunidades de Site & Landing Page
  if (!lead.website || diag?.hasSite === false) {
    score += 25;
    reasons.push("Empresa não possui site próprio registrado, dependendo apenas de ponto físico.");
    serviceOpportunities.push("Criação de Site Institucional / Landing Page de Alta Conversão");
  } else {
    if (diag?.reachable === false) {
      score += 20;
      reasons.push("Website cadastrado está inacessível ou fora do ar.");
      serviceOpportunities.push("Modernização Web e Recuperação de Domínio");
    } else if (diag?.https === false || /^http:\/\//i.test(lead.website)) {
      score += 15;
      reasons.push("Website não possui certificado de segurança HTTPS (aviso de site não seguro no navegador).");
      serviceOpportunities.push("Adequação de Segurança Web HTTPS e Redesign");
    }

    if (diag?.hasWhatsappLink === false && diag.reachable !== false) {
      score += 12;
      reasons.push("Website atual não possui botão direto ou fluxo de conversão para WhatsApp.");
      serviceOpportunities.push("Implementação de Widget e Fluxo WhatsApp no Site");
    }

    if (diag?.hasAnalytics === false && diag.reachable !== false) {
      score += 15;
      reasons.push("Website sem Meta Pixel ou Google Analytics detectados para mensurar resultados.");
      serviceOpportunities.push("Gestão de Tráfego Pago & Rastreamento (Pixel/GTM/Analytics)");
    }
  }

  // 2. Oportunidades de Google Meu Negócio e Identidade Visual
  if (lead.claimed === false) {
    score += 20;
    reasons.push("Perfil no Google Maps não foi reivindicado pela empresa (vulnerável a edições de terceiros).");
    serviceOpportunities.push("Otimização e Reivindicação de Google Meu Negócio");
  }

  if (lead.photosCount != null && lead.photosCount < 5) {
    score += 10;
    reasons.push("Perfil visual no Google possui poucas fotos, reduzindo atratividade local.");
    serviceOpportunities.push("Produção de Conteúdo Visual e Identidade da Marca");
  }

  if (lead.rating != null && lead.rating < 4.2 && (lead.reviewsCount || 0) >= 3) {
    score += 15;
    reasons.push(`Avaliação média no Google (${lead.rating.toFixed(1)} estrelas) com margem para melhoria de reputação.`);
    serviceOpportunities.push("Estratégia de Gestão de Reputação e Avaliações de Clientes");
  }

  // 3. Canais de Comunicação e Abordagem
  if (!hasWhatsapp) {
    score += 12;
    reasons.push("Sem número de WhatsApp direto divulgado nos registros públicos.");
    serviceOpportunities.push("Estruturação de Canal Comercial no WhatsApp");
  }

  if (hasPhone || hasEmail) {
    score += 10;
    reasons.push("Canais de contato disponíveis para prospecção imediata.");
  } else {
    score -= 15;
    reasons.push("Poucos canais diretos de contato imediato identificados.");
  }

  // 4. Porte e Capacidade de Investimento
  const porte = lead.fiscal?.porte?.toUpperCase();
  if (lead.isNetwork && (lead.networkUnitsCount || 0) >= 2) {
    score += 15;
    reasons.push(`Rede com ${lead.networkUnitsCount} unidades na região com necessidade de presença multirregional padronizada.`);
    serviceOpportunities.push("Campanhas Corporativas Multiunidades e Branding");
  } else if (porte === "ME" || porte === "EPP") {
    score += 12;
    reasons.push("Empresa de pequeno/médio porte (PME) com ciclo rápido de decisão comercial.");
    serviceOpportunities.push("Aceleração de Vendas PME com Tráfego Local");
  } else if (porte === "MEI") {
    score += 8;
    reasons.push("Microempreendedor individual com grande potencial de digitalização.");
    serviceOpportunities.push("Landing Page de Lançamento e Presença Digital");
  }

  if (lead.fiscal?.socios && lead.fiscal.socios.length > 0) {
    score += 8;
    reasons.push(`Quadro societário com ${lead.fiscal.socios.length} sócio(s) identificado(s) para abordagem qualificada.`);
  }

  // 5. Verificação Cadastral Negativa
  if (lead.fiscal?.situacao && !/ativa/i.test(lead.fiscal.situacao)) {
    score -= 40;
    reasons.push(`Alerta cadastral: situação na Receita Federal consta como "${lead.fiscal.situacao}".`);
  }

  if (serviceOpportunities.length === 0) {
    serviceOpportunities.push("Diagnóstico Digital e Otimização Comercial de Rotina");
  }

  const finalScore = Math.max(15, Math.min(100, score));
  return { score: finalScore, reasons, serviceOpportunities };
}

/**
 * Atribui ambas as pontuações e explicações ao MasterLead.
 */
export function calculateLeadScores(
  lead: MasterLead,
  targetTerms: string[],
  relatedCategories: string[] = [],
  cnaes: string[] = []
): MasterLead {
  const rel = calculateRelevanceScore(lead, targetTerms, relatedCategories, cnaes);
  const com = calculateCommercialScore(lead);

  lead.relevanceScore = rel.score;
  lead.relevanceReasons = rel.reasons;
  lead.commercialScore = com.score;
  lead.commercialReasons = com.reasons;
  lead.serviceOpportunities = com.serviceOpportunities;

  // Score composto ponderado (para manter compatibilidade)
  lead.score = Math.round(com.score * 0.6 + rel.score * 0.4);

  return lead;
}

/**
 * Diversificação de Resultados (Fair Ranking / Round-Robin):
 * Evita que uma única marca (ex: Panvel) monopolize os primeiros resultados,
 * intercalando marcas, estabelecimentos independentes, matrizes e filiais,
 * mantendo 100% de todas as unidades encontradas na lista completa.
 */
export function diversifyLeads(leads: MasterLead[]): MasterLead[] {
  if (leads.length <= 2) return leads;

  const groups = new Map<string, MasterLead[]>();
  for (const l of leads) {
    const key = l.isNetwork && l.networkName
      ? `net:${normName(l.networkName)}`
      : `ind:${l.key}`;
    const list = groups.get(key) ?? [];
    list.push(l);
    groups.set(key, list);
  }

  for (const list of groups.values()) {
    list.sort((a, b) => b.score - a.score || (b.reviewsCount || 0) - (a.reviewsCount || 0));
  }

  const netGroups: MasterLead[][] = [];
  const indepGroups: MasterLead[][] = [];

  for (const list of groups.values()) {
    if (list.length > 1 || list[0]?.isNetwork) {
      netGroups.push(list);
    } else {
      indepGroups.push(list);
    }
  }

  netGroups.sort((a, b) => b[0]!.score - a[0]!.score);
  indepGroups.sort((a, b) => b[0]!.score - a[0]!.score);

  const result: MasterLead[] = [];
  let remainingCount = leads.length;

  while (remainingCount > 0) {
    let progressed = false;

    // Até 2 estabelecimentos independentes por rodada
    for (let i = 0; i < 2; i++) {
      const indGroup = indepGroups.find((g) => g.length > 0);
      if (indGroup) {
        result.push(indGroup.shift()!);
        remainingCount--;
        progressed = true;
      }
    }

    // 1 de cada rede por rodada
    for (const ng of netGroups) {
      if (ng.length > 0) {
        result.push(ng.shift()!);
        remainingCount--;
        progressed = true;
      }
    }

    if (!progressed) {
      for (const g of [...indepGroups, ...netGroups]) {
        while (g.length > 0) {
          result.push(g.shift()!);
          remainingCount--;
        }
      }
      break;
    }
  }

  return result;
}

/**
 * Ordena os leads preservando todos os registros encontrados.
 */
export function sortLeads(leads: MasterLead[], mode: SortMode): MasterLead[] {
  const list = [...leads];

  switch (mode) {
    case "relevancia":
      return list.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0) || b.score - a.score);

    case "potencial":
      return list.sort((a, b) => (b.commercialScore || 0) - (a.commercialScore || 0) || b.score - a.score);

    case "porte":
      return list.sort((a, b) => {
        const porteScore = (l: MasterLead) => {
          if (l.isNetwork && (l.networkUnitsCount || 0) >= 3) return 100;
          if (l.fiscal?.porte === "DEMAIS") return 90;
          if (l.sizeCategory === "grande") return 80;
          if (l.fiscal?.porte === "EPP") return 70;
          if (l.fiscal?.porte === "ME") return 50;
          if (l.fiscal?.porte === "MEI") return 30;
          return 20;
        };
        return (
          porteScore(b) - porteScore(a) ||
          (b.fiscal?.capitalSocial || 0) - (a.fiscal?.capitalSocial || 0) ||
          b.score - a.score
        );
      });

    case "redes":
      return list.sort((a, b) => {
        const netA = a.isNetwork ? (a.networkUnitsCount || 2) : 0;
        const netB = b.isNetwork ? (b.networkUnitsCount || 2) : 0;
        return netB - netA || b.score - a.score;
      });

    case "independentes":
      return list.sort((a, b) => {
        const indA = a.companyType === "independente" ? 1 : 0;
        const indB = b.companyType === "independente" ? 1 : 0;
        return indB - indA || b.score - a.score;
      });

    case "completude":
      return list.sort((a, b) => {
        const dataCount = (l: MasterLead) =>
          l.phones.length * 2 +
          l.emails.length * 2 +
          (l.website ? 2 : 0) +
          (l.cnpj ? 3 : 0) +
          (l.address ? 1 : 0) +
          (l.fiscal?.socios?.length ? 2 : 0);
        return dataCount(b) - dataCount(a) || b.score - a.score;
      });

    case "recentes":
      // Ordem de coleta original sem alteração
      return list;

    case "recomendada":
    default:
      return diversifyLeads(list);
  }
}
