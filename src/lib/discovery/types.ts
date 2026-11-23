export type SourceName = "osm" | "google_maps" | "receita" | "site" | "nominatim" | "manual";

export type CompanyType = "matriz" | "filial" | "independente" | "desconhecido";
export type RelationType = "matriz" | "filial" | "franquia" | "independente" | "desconhecido";
export type SizeCategory = "grande" | "pme";

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
  abertura?: string;          // ISO yyyy-mm-dd
  porte?: string;             // MEI | ME | EPP | DEMAIS
  capitalSocial?: number;
  cnaePrincipal?: { code: string; description: string };
  cnaesSecundarios?: { code: string; description: string }[];
  socios?: { nome: string; qualificacao: string }[];
  email?: string;
  telefones?: string[];
}

export interface SiteDiagnosis {
  hasSite: boolean;
  reachable?: boolean;
  https?: boolean;
  redirectedTo?: string;
  hasAnalytics?: boolean;
  hasWhatsappLink?: boolean;
  status?: number;
  error?: string;
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
}
