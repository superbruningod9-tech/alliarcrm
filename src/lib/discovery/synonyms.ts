const strip = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

export interface NicheProfile {
  label: string;
  synonyms: string[];
  /** seletores OSM (chave=valor) */
  osm: string[];
}

const NICHES: { match: string[]; profile: NicheProfile }[] = [
  { match: ["pet shop", "petshop", "pet"], profile: { label: "Pet shop", synonyms: ["pet shop", "banho e tosa", "clínica veterinária", "hotel para cães", "agropecuária", "veterinário"], osm: ["shop=pet", "amenity=veterinary", "shop=pet_grooming", "amenity=animal_boarding"] } },
  { match: ["odonto", "dentista", "clinica odontologica"], profile: { label: "Clínica odontológica", synonyms: ["clínica odontológica", "dentista", "ortodontia", "implante dentário", "consultório odontológico"], osm: ["amenity=dentist", "healthcare=dentist"] } },
  { match: ["oficina", "mecanica", "auto center"], profile: { label: "Oficina mecânica", synonyms: ["oficina mecânica", "auto center", "mecânico", "funilaria e pintura", "auto elétrica"], osm: ["shop=car_repair", "craft=mechanic", "shop=tyres"] } },
  { match: ["academia", "fitness", "crossfit"], profile: { label: "Academia", synonyms: ["academia", "crossfit", "pilates", "estúdio fitness", "musculação"], osm: ["leisure=fitness_centre", "leisure=sports_centre", "sport=fitness"] } },
  { match: ["farmacia", "drogaria"], profile: { label: "Farmácia", synonyms: ["farmácia", "drogaria", "farmácia de manipulação"], osm: ["amenity=pharmacy", "healthcare=pharmacy"] } },
  { match: ["restaurante", "lanchonete", "pizzaria"], profile: { label: "Restaurante", synonyms: ["restaurante", "lanchonete", "pizzaria", "hamburgueria", "bar e restaurante"], osm: ["amenity=restaurant", "amenity=fast_food", "amenity=cafe", "amenity=bar"] } },
  { match: ["salao", "beleza", "barbearia", "cabeleireiro"], profile: { label: "Salão de beleza", synonyms: ["salão de beleza", "barbearia", "cabeleireiro", "estúdio de unhas", "estética"], osm: ["shop=hairdresser", "shop=beauty", "shop=nails", "amenity=barber"] } },
  { match: ["clinica medica", "medico", "clinica"], profile: { label: "Clínica médica", synonyms: ["clínica médica", "consultório médico", "policlínica", "clínica de saúde"], osm: ["amenity=clinic", "amenity=doctors", "healthcare=clinic", "healthcare=doctor"] } },
  { match: ["advocacia", "advogado", "juridico"], profile: { label: "Advocacia", synonyms: ["escritório de advocacia", "advogado", "assessoria jurídica"], osm: ["office=lawyer", "office=notary"] } },
  { match: ["contabilidade", "contador"], profile: { label: "Contabilidade", synonyms: ["escritório de contabilidade", "contador", "assessoria contábil"], osm: ["office=accountant"] } },
  { match: ["arquitetura", "arquiteto"], profile: { label: "Arquitetura", synonyms: ["escritório de arquitetura", "arquiteto", "design de interiores", "engenharia civil"], osm: ["office=architect", "craft=carpenter"] } },
  { match: ["escola", "curso", "idiomas"], profile: { label: "Escola / Curso", synonyms: ["escola", "curso de idiomas", "escola de música", "reforço escolar", "creche"], osm: ["amenity=school", "amenity=language_school", "amenity=kindergarten", "amenity=music_school"] } },
  { match: ["imobiliaria", "corretor"], profile: { label: "Imobiliária", synonyms: ["imobiliária", "corretor de imóveis", "administradora de imóveis"], osm: ["office=estate_agent"] } },
  { match: ["hotel", "pousada", "hospedagem"], profile: { label: "Hotel / Pousada", synonyms: ["hotel", "pousada", "hostel", "hospedagem"], osm: ["tourism=hotel", "tourism=guest_house", "tourism=hostel", "tourism=motel"] } },
  { match: ["supermercado", "mercado", "mercearia"], profile: { label: "Supermercado", synonyms: ["supermercado", "mercado", "mercearia", "minimercado"], osm: ["shop=supermarket", "shop=convenience", "shop=greengrocer"] } },
  { match: ["padaria", "confeitaria"], profile: { label: "Padaria", synonyms: ["padaria", "confeitaria", "doceria"], osm: ["shop=bakery", "shop=pastry"] } },
  { match: ["otica", "oculos"], profile: { label: "Ótica", synonyms: ["ótica", "óptica", "optometria"], osm: ["shop=optician", "healthcare=optometrist"] } },
  { match: ["loja de roupa", "moda", "vestuario"], profile: { label: "Moda", synonyms: ["loja de roupas", "boutique", "moda feminina", "moda masculina"], osm: ["shop=clothes", "shop=boutique", "shop=shoes"] } },
  { match: ["construcao", "material de construcao"], profile: { label: "Material de construção", synonyms: ["material de construção", "casa de tintas", "ferragens"], osm: ["shop=doityourself", "shop=hardware", "shop=paint", "shop=trade"] } },
];

/** Gera variações semânticas e seletores OSM para um nicho digitado pelo usuário. */
export function expandNiche(term: string): NicheProfile {
  const t = strip(term);
  for (const n of NICHES) {
    if (n.match.some((m) => t.includes(strip(m)) || strip(m).includes(t)) && t.length >= 3) {
      const syn = Array.from(new Set([term.trim(), ...n.profile.synonyms]));
      return { ...n.profile, synonyms: syn };
    }
  }
  return { label: term.trim(), synonyms: [term.trim()], osm: [] };
}

export function expandNiches(terms: string[]): NicheProfile {
  const syn = new Set<string>(), osm = new Set<string>(), labels: string[] = [];
  for (const t of terms.filter((x) => x.trim())) {
    const p = expandNiche(t);
    labels.push(p.label);
    p.synonyms.forEach((s) => syn.add(s));
    p.osm.forEach((s) => osm.add(s));
  }
  return { label: labels.join(", "), synonyms: [...syn], osm: [...osm] };
}
