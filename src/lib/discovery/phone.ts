import type { PhoneInfo, SourceName } from "./types";

const VALID_DDD = new Set(
  "11 12 13 14 15 16 17 18 19 21 22 24 27 28 31 32 33 34 35 37 38 41 42 43 44 45 46 47 48 49 51 53 54 55 61 62 63 64 65 66 67 68 69 71 73 74 75 77 79 81 82 83 84 85 86 87 88 89 91 92 93 94 95 96 97 98 99".split(
    " ",
  ),
);

export interface NormalizedPhone {
  e164: string;
  national: string;
  ddd: string;
  type: PhoneInfo["type"];
  whatsappLikely: boolean;
}

/** Normaliza telefone brasileiro para E.164. Retorna null se inválido. */
export function normalizeBrPhone(input: string | null | undefined): NormalizedPhone | null {
  if (!input) return null;
  let d = String(input).replace(/\D/g, "");
  if (!d) return null;

  if (/^0?800\d{6,7}$/.test(d) || /^0?300\d{6,7}$/.test(d) || /^0?400\d{5,6}$/.test(d)) {
    const n = d.replace(/^0/, "");
    return { e164: `+55${n}`, national: n, ddd: "", type: "tollfree", whatsappLikely: false };
  }

  if (d.startsWith("00")) d = d.replace(/^00/, "");
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) d = d.slice(2);
  d = d.replace(/^0+/, ""); // zero de tronco / operadora

  if (d.length !== 10 && d.length !== 11) return null;
  const ddd = d.slice(0, 2);
  if (!VALID_DDD.has(ddd)) return null;
  const sub = d.slice(2);

  let type: PhoneInfo["type"] = "unknown";
  if (sub.length === 9) {
    if (sub[0] !== "9") return null;
    type = "mobile";
  } else if (/^[2-5]/.test(sub)) {
    type = "landline";
  } else if (/^[6-9]/.test(sub)) {
    type = "mobile"; // celular antigo (8 dígitos) — normaliza adicionando o 9
    d = ddd + "9" + sub;
  } else return null;

  const local = d.slice(2);
  const national =
    local.length === 9 ? `(${ddd}) ${local.slice(0, 5)}-${local.slice(5)}` : `(${ddd}) ${local.slice(0, 4)}-${local.slice(4)}`;
  return { e164: `+55${d}`, national, ddd, type, whatsappLikely: type === "mobile" };
}

/** Une telefones de várias fontes, sem duplicar formatos diferentes do mesmo número. */
export function mergePhones(entries: { raw: string; source: SourceName }[]): PhoneInfo[] {
  const map = new Map<string, PhoneInfo>();
  for (const e of entries) {
    const n = normalizeBrPhone(e.raw);
    if (!n) continue;
    const cur = map.get(n.e164);
    if (cur) {
      if (!cur.sources.includes(e.source)) cur.sources.push(e.source);
      cur.confirmed = cur.sources.length > 1;
    } else {
      map.set(n.e164, { ...n, sources: [e.source], confirmed: false });
    }
  }
  const order = { mobile: 0, landline: 1, tollfree: 2, unknown: 3 } as const;
  return [...map.values()].sort((a, b) => order[a.type] - order[b.type]);
}

/** Extrai telefones de texto livre (rodapé/contato). */
export function extractPhonesFromText(text: string): string[] {
  const re = /(?:\+?55\s?)?\(?\b0?([1-9]{2})\)?[\s.-]?(9?\d{4})[\s.-]?(\d{4})\b/g;
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const n = normalizeBrPhone(`${m[1]}${m[2]}${m[3]}`);
    if (n) out.add(n.e164);
  }
  return [...out];
}
