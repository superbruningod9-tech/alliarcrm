const strip = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

export interface NicheProfile {
  label: string;
  synonyms: string[];
  /** Categorias e vertentes relacionadas separadas (ex: distribuidores, atacado, insumos) */
  relatedCategories?: string[];
  /** CNAEs principais e secundários associados ao nicho */
  cnaes?: string[];
  /** seletores OSM (chave=valor ou chave) */
  osm: string[];
}

/** Gera variações morfológicas (singular/plural) em português */
export function generateMorphologicalVariations(term: string): string[] {
  const t = term.trim().toLowerCase();
  const variations = new Set<string>([t]);

  // Se termina com 's', gera versão no singular
  if (t.endsWith("ns")) {
    variations.add(t.slice(0, -2) + "m");
  } else if (t.endsWith("is") && (t.endsWith("ais") || t.endsWith("eis") || t.endsWith("ois"))) {
    variations.add(t.slice(0, -2) + "l");
  } else if (t.endsWith("res") || t.endsWith("zes") || t.endsWith("ses")) {
    variations.add(t.slice(0, -2));
  } else if (t.endsWith("s") && !t.endsWith("ss") && t.length > 3) {
    variations.add(t.slice(0, -1));
  }

  // Gera versão no plural
  if (t.endsWith("m")) {
    variations.add(t.slice(0, -1) + "ns");
  } else if (t.endsWith("r") || t.endsWith("z")) {
    variations.add(t + "es");
  } else if (t.endsWith("l") && !t.endsWith("el")) {
    variations.add(t.slice(0, -1) + "is");
  } else if (!t.endsWith("s")) {
    variations.add(t + "s");
  }

  return [...variations];
}

const NICHES: { match: string[]; profile: NicheProfile }[] = [
  {
    match: ["pet shop", "petshop", "pet", "veterinario", "veterinaria", "banho e tosa"],
    profile: {
      label: "Pet shop",
      synonyms: ["pet shop", "banho e tosa", "clínica veterinária", "hotel para cães", "agropecuária", "veterinário", "veterinária", "pet care", "estética animal", "hospital veterinário"],
      relatedCategories: ["distribuidora de rações", "produtos agropecuários", "creche canina", "adestramento de cães"],
      cnaes: ["4789-0/04", "7500-1/00", "9609-2/08"],
      osm: ["shop=pet", "amenity=veterinary", "shop=pet_grooming", "amenity=animal_boarding"],
    },
  },
  {
    match: ["odonto", "dentista", "clinica odontologica", "ortodontia"],
    profile: {
      label: "Clínica odontológica",
      synonyms: ["clínica odontológica", "dentista", "ortodontia", "implante dentário", "consultório odontológico", "odontopediatria", "prótese dentária", "endodontia", "harmonização orofacial"],
      relatedCategories: ["laboratório de prótese dentária", "distribuidora de produtos odontológicos", "radiologia odontológica"],
      cnaes: ["8630-5/04", "3250-7/06"],
      osm: ["amenity=dentist", "healthcare=dentist"],
    },
  },
  {
    match: ["oficina", "mecanica", "auto center", "auto eletrica", "funilaria"],
    profile: {
      label: "Oficina mecânica",
      synonyms: ["oficina mecânica", "auto center", "mecânico", "funilaria e pintura", "auto elétrica", "reparação automotiva", "troca de óleo", "pneus", "geometria e balanceamento"],
      relatedCategories: ["loja de autopeças", "distribuidora de peças automotivas", "auto socorro e guincho", "retífica de motores"],
      cnaes: ["4520-0/01", "4520-0/02", "4530-7/03"],
      osm: ["shop=car_repair", "craft=mechanic", "shop=tyres", "shop=car_parts"],
    },
  },
  {
    match: ["academia", "fitness", "crossfit", "pilates", "musculacao"],
    profile: {
      label: "Academia",
      synonyms: ["academia", "crossfit", "pilates", "estúdio fitness", "musculação", "treinamento funcional", "artes marciais", "ginástica", "box de cross training"],
      relatedCategories: ["loja de suplementos", "distribuidora de suplementos alimentares", "fisioterapia esportiva"],
      cnaes: ["9313-1/00", "9312-3/00"],
      osm: ["leisure=fitness_centre", "leisure=sports_centre", "sport=fitness"],
    },
  },
  {
    match: ["farmacia", "drogaria", "manipulacao"],
    profile: {
      label: "Farmácia",
      synonyms: [
        "farmácia", "drogaria", "farmácia de manipulação", "farmácia magistral",
        "farmácia independente", "farmácia de bairro", "farmácia popular", "farmácia especializada",
        "produtos farmacêuticos", "medicamentos"
      ],
      relatedCategories: [
        "distribuidora de medicamentos", "distribuidora farmacêutica",
        "produtos hospitalares", "laboratório farmacêutico"
      ],
      cnaes: ["4771-7/01", "4771-7/02", "4771-7/03", "4644-3/01"],
      osm: ["amenity=pharmacy", "healthcare=pharmacy"],
    },
  },
  {
    match: ["restaurante", "lanchonete", "pizzaria", "hamburgueria", "gastronomia", "bistro", "comida"],
    profile: {
      label: "Restaurante",
      synonyms: ["restaurante", "lanchonete", "pizzaria", "hamburgueria", "bar e restaurante", "churrascaria", "bistrô", "comida caseira", "delivery", "cafeteria", "sushi bar"],
      relatedCategories: ["distribuidora de alimentos", "frigorífico", "hortifruti atacado", "cozinha industrial", "panificação atacado"],
      cnaes: ["5611-2/01", "5611-2/03", "5620-1/01"],
      osm: ["amenity=restaurant", "amenity=fast_food", "amenity=cafe", "amenity=bar"],
    },
  },
  {
    match: ["salao", "beleza", "barbearia", "cabeleireiro", "estetica", "manicure"],
    profile: {
      label: "Salão de beleza",
      synonyms: ["salão de beleza", "barbearia", "cabeleireiro", "estúdio de unhas", "estética", "design de sobrancelhas", "depilação", "podologia", "clínica de estética"],
      relatedCategories: ["distribuidora de cosméticos", "produtos de beleza atacado", "escola de estética e micropigmentação"],
      cnaes: ["9602-5/01", "9602-5/02"],
      osm: ["shop=hairdresser", "shop=beauty", "shop=nails", "amenity=barber"],
    },
  },
  {
    match: ["clinica medica", "medico", "clinica", "consultorio", "saude", "policlinica"],
    profile: {
      label: "Clínica médica",
      synonyms: ["clínica médica", "consultório médico", "policlínica", "clínica de saúde", "centro médico", "medicina diagnóstica", "fisioterapia", "psicologia", "exames laboratoriais"],
      relatedCategories: ["laboratório de análises clínicas", "distribuidora de material hospitalar", "equipamentos médicos"],
      cnaes: ["8630-5/01", "8630-5/02", "8640-2/02"],
      osm: ["amenity=clinic", "amenity=doctors", "healthcare=clinic", "healthcare=doctor"],
    },
  },
  {
    match: ["advocacia", "advogado", "juridico", "direito"],
    profile: {
      label: "Advocacia",
      synonyms: ["escritório de advocacia", "advogado", "assessoria jurídica", "consultoria jurídica", "sociedade de advogados"],
      osm: ["office=lawyer", "office=notary"],
    },
  },
  {
    match: ["contabilidade", "contador", "fiscal"],
    profile: {
      label: "Contabilidade",
      synonyms: ["escritório de contabilidade", "contador", "assessoria contábil", "consultoria tributária", "perícia contábil"],
      osm: ["office=accountant", "office=financial"],
    },
  },
  {
    match: ["arquitetura", "arquiteto", "engenharia", "design de interiores"],
    profile: {
      label: "Arquitetura e Engenharia",
      synonyms: ["escritório de arquitetura", "arquiteto", "design de interiores", "engenharia civil", "projetos estruturais", "construções"],
      osm: ["office=architect", "office=engineer", "craft=carpenter"],
    },
  },
  {
    match: ["escola", "curso", "idiomas", "colegio", "creche"],
    profile: {
      label: "Educação",
      synonyms: ["escola", "curso de idiomas", "escola de música", "reforço escolar", "creche", "colégio", "centro educacional"],
      osm: ["amenity=school", "amenity=language_school", "amenity=kindergarten", "amenity=music_school"],
    },
  },
  {
    match: ["imobiliaria", "corretor", "imoveis"],
    profile: {
      label: "Imobiliária",
      synonyms: ["imobiliária", "corretor de imóveis", "administradora de imóveis", "venda de imóveis", "locação de imóveis"],
      osm: ["office=estate_agent"],
    },
  },
  {
    match: ["hotel", "pousada", "hospedagem", "hostel"],
    profile: {
      label: "Hotelaria",
      synonyms: ["hotel", "pousada", "hostel", "hospedagem", "flat", "resort"],
      osm: ["tourism=hotel", "tourism=guest_house", "tourism=hostel", "tourism=motel"],
    },
  },
  {
    match: ["supermercado", "mercado", "mercearia", "minimercado"],
    profile: {
      label: "Supermercado",
      synonyms: ["supermercado", "mercado", "mercearia", "minimercado", "empório", "hortifruti"],
      osm: ["shop=supermarket", "shop=convenience", "shop=greengrocer"],
    },
  },
  {
    match: ["padaria", "confeitaria", "doceria"],
    profile: {
      label: "Padaria",
      synonyms: ["padaria", "confeitaria", "doceria", "panificadora", "pães artesanais"],
      osm: ["shop=bakery", "shop=pastry"],
    },
  },
  {
    match: ["otica", "oculos", "oticas"],
    profile: {
      label: "Ótica",
      synonyms: ["ótica", "óptica", "optometria", "óculos e lentes"],
      osm: ["shop=optician", "healthcare=optometrist"],
    },
  },
  {
    match: ["loja de roupa", "moda", "vestuario", "calcados", "boutique"],
    profile: {
      label: "Moda e Vestuário",
      synonyms: ["loja de roupas", "boutique", "moda feminina", "moda masculina", "loja de calçados", "acessórios de moda"],
      osm: ["shop=clothes", "shop=boutique", "shop=shoes"],
    },
  },
  {
    match: ["construcao", "material de construcao", "tintas", "ferragens"],
    profile: {
      label: "Material de construção",
      synonyms: ["material de construção", "casa de tintas", "ferragens", "madeireira", "materiais elétricos e hidráulicos"],
      osm: ["shop=doityourself", "shop=hardware", "shop=paint", "shop=trade"],
    },
  },
  {
    match: ["tecnologia", "software", "ti", "informatica", "sistemas", "desenvolvimento"],
    profile: {
      label: "Tecnologia e Software",
      synonyms: ["empresa de software", "tecnologia da informação", "consultoria de ti", "desenvolvimento web", "suporte de informática"],
      osm: ["office=it", "office=company", "shop=computer"],
    },
  },
  {
    match: ["energia solar", "solar", "fotovoltaica"],
    profile: {
      label: "Energia Solar",
      synonyms: ["energia solar", "painéis solares", "energia fotovoltaica", "engenharia solar"],
      osm: ["office=energy", "shop=energy", "office=company"],
    },
  },
  {
    match: ["logistica", "transportadora", "frete"],
    profile: {
      label: "Transporte e Logística",
      synonyms: ["transportadora", "logística", "fretes e encomendas", "armazém logístico"],
      osm: ["office=logistics", "office=company"],
    },
  },
];

/** Gera variações semânticas e seletores OSM para um nicho digitado pelo usuário. */
export function expandNiche(term: string): NicheProfile {
  const t = strip(term);
  const morph = generateMorphologicalVariations(term);

  for (const n of NICHES) {
    if (n.match.some((m) => t.includes(strip(m)) || strip(m).includes(t)) && t.length >= 3) {
      const syn = Array.from(new Set([term.trim(), ...morph, ...n.profile.synonyms]));
      return {
        ...n.profile,
        synonyms: syn,
        relatedCategories: n.profile.relatedCategories,
        cnaes: n.profile.cnaes,
      };
    }
  }

  // Se o termo não estiver na lista fixa, deduz categorias OSM comuns e CNAEs aproximados
  const derivedOsm: string[] = [];
  const derivedRelated: string[] = [];
  const derivedCnaes: string[] = [];

  if (/clinica|saude|medico|odonto|psico/i.test(t)) {
    derivedOsm.push("amenity=clinic", "healthcare=clinic");
    derivedRelated.push("distribuidora de materiais médicos", "laboratório de análises");
    derivedCnaes.push("8630-5/01");
  }
  if (/loja|comercio|venda/i.test(t)) {
    derivedOsm.push("shop=yes");
    derivedRelated.push("distribuidora atacadista", "representação comercial");
    derivedCnaes.push("4712-1/00");
  }
  if (/escritorio|consultoria|empresa/i.test(t)) {
    derivedOsm.push("office=company");
    derivedRelated.push("assessoria empresarial", "serviços administrativos");
    derivedCnaes.push("7020-4/00");
  }
  if (/restaurante|bar|comida|lanche/i.test(t)) {
    derivedOsm.push("amenity=restaurant");
    derivedRelated.push("distribuidora de alimentos", "bebidas atacado");
    derivedCnaes.push("5611-2/01");
  }

  return {
    label: term.trim(),
    synonyms: Array.from(new Set([term.trim(), ...morph])),
    relatedCategories: derivedRelated,
    cnaes: derivedCnaes,
    osm: derivedOsm,
  };
}

export function expandNiches(terms: string[]): NicheProfile {
  const syn = new Set<string>(), osm = new Set<string>(), rel = new Set<string>(), cnaes = new Set<string>(), labels: string[] = [];
  for (const t of terms.filter((x) => x.trim())) {
    const p = expandNiche(t);
    labels.push(p.label);
    p.synonyms.forEach((s) => syn.add(s));
    p.osm.forEach((s) => osm.add(s));
    p.relatedCategories?.forEach((r) => rel.add(r));
    p.cnaes?.forEach((c) => cnaes.add(c));
  }
  return {
    label: labels.join(", "),
    synonyms: [...syn],
    osm: [...osm],
    relatedCategories: [...rel],
    cnaes: [...cnaes],
  };
}
