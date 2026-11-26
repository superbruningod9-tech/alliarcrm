const RANK: Record<string, number> = { accepted: 0, sent: 1, delivered: 2, read: 3, failed: 4 };
export const statusRank = (s: string) => RANK[s] ?? 0;

const VALID_BR_DDD = new Set(
  "11 12 13 14 15 16 17 18 19 21 22 24 27 28 31 32 33 34 35 37 38 41 42 43 44 45 46 47 48 49 51 53 54 55 61 62 63 64 65 66 67 68 69 71 73 74 75 77 79 81 82 83 84 85 86 87 88 89 91 92 93 94 95 96 97 98 99".split(
    " ",
  ),
);

/** Normaliza telefone brasileiro para E.164 sem "+" (trata 0055, prefixo 0 de tronco e DDI 55 sem duplicar). */
export function toE164(phone: string) {
  let d = String(phone || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("00")) d = d.slice(2);
  d = d.replace(/^0+/, "");
  if (!d) return "";
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) {
    return d;
  }
  return d.length === 10 || d.length === 11 ? `55${d}` : d;
}

export interface DialablePhoneResult {
  valid: boolean;
  e164: string;
  national: string;
  telUri: string;
  waUrl: string;
  display: string;
  error?: string;
}

/** Valida telefone brasileiro para discagem (`tel:+55...`), WhatsApp (`wa.me/55...`) e QR Code. */
export function normalizePhoneForDialer(phone: string): DialablePhoneResult {
  const e164 = toE164(phone);
  if (!e164) {
    return { valid: false, e164: "", national: "", telUri: "", waUrl: "", display: "", error: "Informe um número de telefone." };
  }

  if (/^(\d)\1+$/.test(e164)) {
    return { valid: false, e164, national: "", telUri: "", waUrl: "", display: "", error: "Número inválido (dígitos repetidos)." };
  }

  const national = e164.startsWith("55") && (e164.length === 12 || e164.length === 13) ? e164.slice(2) : e164;
  if (national.length < 10 || national.length > 11) {
    return {
      valid: false,
      e164,
      national,
      telUri: "",
      waUrl: "",
      display: "",
      error: "Número incompleto ou inválido. Informe DDD + telefone (10 ou 11 dígitos).",
    };
  }

  const ddd = national.slice(0, 2);
  if (!VALID_BR_DDD.has(ddd)) {
    return { valid: false, e164, national, telUri: "", waUrl: "", display: "", error: `DDD (${ddd}) inválido.` };
  }

  const local = national.slice(2);
  if (/^(\d)\1+$/.test(local)) {
    return { valid: false, e164, national, telUri: "", waUrl: "", display: "", error: "Número de telefone inválido." };
  }
  if (local.length === 9 && local[0] !== "9") {
    return { valid: false, e164, national, telUri: "", waUrl: "", display: "", error: "Celular de 9 dígitos deve iniciar com 9." };
  }

  const fullE164 = `55${national}`;
  const display =
    local.length === 9 ? `+55 (${ddd}) ${local.slice(0, 5)}-${local.slice(5)}` : `+55 (${ddd}) ${local.slice(0, 4)}-${local.slice(4)}`;

  return {
    valid: true,
    e164: fullE164,
    national,
    telUri: `tel:+${fullE164}`,
    waUrl: `https://wa.me/${fullE164}`,
    display,
  };
}

/** Chave para casar números com/sem 55 e com/sem o nono dígito: DDD + últimos 8 dígitos. */
export function phoneKey(phone: string) {
  const d = toE164(phone);
  const local = d.startsWith("55") ? d.slice(2) : d;
  return local.length >= 10 ? local.slice(0, 2) + local.slice(-8) : local;
}
