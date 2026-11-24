export type SourceName = "osm" | "google_maps" | "receita" | "site" | "nominatim" | "manual";

export type CompanyType = "matriz" | "filial" | "independente" | "desconhecido";
export type RelationType = "matriz" | "filial" | "franquia" | "independente" | "desconhecido";
export type SizeCategory = "grande" | "pme";

export type QualityStatus =
  | "confirmado"          // Visto e confirmado em 2+ fontes
  | "encontrado"          // Encontrado em 1 fonte confiável
  | "nao_verificado"      // Valor bruto ainda não checado
  | "nao_encontrado"      // Pesquisado em registros públicos e ausente
  | "pendente"            // Aguardando na fila de enriquecimento
  | "erro";               // Falha/indisponibilidade na consulta à fonte

export interface FieldMeta<T = any> {
  value: T;
  source: SourceName;
  sources: SourceName[];
  status: QualityStatus;
  enrichedAt?: string;
  note?: string;
}

export interface BBox { latMin: number; lngMin: number; latMax: number; lngMax: number }
export interface LatLng { lat: number; lng: number }

export interface RawPhone { raw: string; source: SourceName }

/** Registro bruto vindo de UMA fonte, antes da fusão. */
export interface RawRecord {
  source: SourceName;
  sourceId?: string;          // place_id, osm id, etc.
  name: string;
  brandName?: string;
  unitName?: string;
  altNames?: string[];
  category?: string;
  categories?: string[];
  address?: string;
  street?: string; number?: string; neighborhood?: string; city?: string; state?: string; cep?: string;
  lat?: number; lng?: number;
  phones?: string[];
  emails?: string[];
  website?: string;
  whatsapp?: string[];
  socials?: Partial<Record<"instagram" | "facebook" | "linkedin" | "youtube" | "tiktok", string>>;
  cnpj?: string;
  openingHours?: string;
  rating?: number; reviewsCount?: number;
  claimed?: boolean; photosCount?: number;
  reviews?: { text: string; rating: number; date?: string }[];
  fiscal?: FiscalProfile;
  siteDiagnosis?: SiteDiagnosis;
}

export interface FiscalProfile {
  cnpj: string;
  razaoSocial?: string;
  nomeFantasia?: string;
  situacao?: string;
  situacaoData?: string;
  abertura?: string;          // ISO yyyy-mm-dd
  idadeAnos?: number;
  porte?: string;             // MEI | ME | EPP | DEMAIS
  capitalSocial?: number;
  cnaePrincipal?: { code: string; description: string };
  cnaesSecundarios?: { code: string; description: string }[];
  socios?: { nome: string; qualificacao: string; faixaEtaria?: string }[];
  email?: string;
  telefones?: string[];
  enderecoCadastral?: {
    logradouro?: string;
    numero?: string;
    complemento?: string;
    bairro?: string;
    municipio?: string;
    uf?: string;
    cep?: string;
  };
  isMatriz?: boolean;
  tipoUnidade?: "matriz" | "filial";
}

export interface SiteDiagnosis {
  hasSite: boolean;
  reachable?: boolean;
  https?: boolean;
  redirectedTo?: string;
  hasAnalytics?: boolean;
  hasWhatsappLink?: boolean;
  hasContactForm?: boolean;
  technologies?: string[];
  servicesAndSpecialties?: string[];
  metaDescription?: string;
  pageTitle?: string;
  responseTimeMs?: number;
  status?: number;
  error?: string;
}

export interface ContactChannels {
  landlinePhones: PhoneInfo[];
  mobilePhones: PhoneInfo[];
  whatsappPhones: PhoneInfo[];
  landline?: string;
  mobilePhone?: string;
  whatsapp?: string;
  commercialEmail?: string;
  supportEmail?: string;
  commercialEmails: { value: string; sources: SourceName[]; label: "comercial" | "atendimento" | "geral" }[];
  supportEmails: { value: string; sources: SourceName[]; label: "comercial" | "atendimento" | "geral" }[];
  personalContacts: { name: string; role?: string; phone?: string; email?: string }[];
  officialWebsite?: string;
  socials: Partial<Record<"instagram" | "facebook" | "linkedin" | "youtube" | "tiktok", string>>;
}

export interface CompletenessSection {
  score: number; // 0-100
  status: "completa" | "parcial" | "incompleta";
  missing: string[];
}

export interface CompletenessReport {
  overallScore: number; // 0-100%
  status?: "completa" | "parcial" | "incompleta";
  identification: CompletenessSection;
  fiscal: CompletenessSection;
  contact: CompletenessSection;
  digital: CompletenessSection;
  sections?: {
    identification: CompletenessSection;
    fiscal: CompletenessSection;
    contact: CompletenessSection;
    digital: CompletenessSection;
  };
  missingFields: string[];
}

export interface PhoneInfo {
  e164: string;
  national: string;
  ddd: string;
  type: "mobile" | "landline" | "tollfree" | "unknown";
  whatsappLikely: boolean;
  sources: SourceName[];
  confirmed: boolean;        // visto em 2+ fontes
}

export interface MasterLead {
  key: string;
  name: string;
  // Identidade empresarial e unidades
  brandName?: string;
  unitName?: string;
  displayName?: string;
  companyType?: CompanyType;
  relationType?: RelationType;
  isNetwork?: boolean;
  networkName?: string;
  networkUnitsCount?: number;
  cnpjRoot?: string;
  cnpjBranch?: string;
  cnpjDigit?: string;
  sizeCategory?: SizeCategory;
  category?: string;
  categories: string[];
  address?: string;
  city?: string; state?: string; cep?: string; neighborhood?: string;
  lat?: number; lng?: number;
  phones: PhoneInfo[];
  emails: { value: string; sources: SourceName[] }[];
  website?: string;
  socials: Record<string, string>;
  cnpj?: string;
  fiscal?: FiscalProfile;
  siteDiagnosis?: SiteDiagnosis;
  rating?: number; reviewsCount?: number; claimed?: boolean; photosCount?: number;
  openingHours?: string;
  reviews: { text: string; rating: number; date?: string }[];
  sources: SourceName[];
  /** campo -> fontes que o confirmaram */
  fieldSources: Record<string, SourceName[]>;
  triggers: string[];
  score: number;
  // Pontuações separadas e transparência de motivos
  relevanceScore?: number;
  relevanceReasons?: string[];
  commercialScore?: number;
  commercialReasons?: string[];
  serviceOpportunities?: string[];
  // Enriquecimento estruturado, procedência e completude
  enrichmentStatus?: "pendente" | "processando" | "completo" | "parcial" | "erro";
  enrichedAt?: string;
  completeness?: CompletenessReport;
  contactsDetailed?: ContactChannels;
  contactChannels?: ContactChannels;
  provenance?: Record<string, FieldMeta>;
  qualityStatus?: Record<string, FieldMeta>;

  // Atualização inteligente, preservação de dados e rastreamento
  lastDiscoveredAt?: string;
  lastEnrichedAt?: string;
  lastVerifiedAt?: string;
  updateStatus?: LeadUpdateStatus;
  manualOverrides?: Record<string, boolean>;
  conflicts?: Record<string, ConflictDetail>;
}

export type LeadUpdateStatus = "nova" | "atualizada" | "inalterada" | "desatualizada" | "conflito";

export interface ConflictDetail {
  field: string;
  currentValue: any;
  incomingValue: any;
  incomingSource: string;
  detectedAt: string;
}

export interface UpdateReport {
  totalSearched: number;
  newLeadsCount: number;
  updatedLeadsCount: number;
  unchangedLeadsCount: number;
  newBranchesCount: number;
  newContactsCount: number;
  complementedFieldsCount: number;
  duplicatesAvoided: number;
  conflictsCount: number;
  failedQueriesCount: number;
  mode: "data_only" | "full_discovery";
  timestamp: string;
  details?: {
    newLeadNames: string[];
    updatedLeadNames: string[];
    conflictLeadNames: string[];
  };
}
