export type ColorPalette = "pastel" | "blue" | "mint" | "lavender" | "dark";

export interface ThemeOption {
  id: ColorPalette;
  name: string;
  badge: string;
  description: string;
  preview: {
    primary: string;
    accent: string;
    bg: string;
  };
}

export const THEME_PALETTES: ThemeOption[] = [
  {
    id: "pastel",
    name: "Bege Pastel",
    badge: "Padrão Oficial",
    description: "Fundo acolhedor em bege linho (#F7F3EB), cartões em branco suave (#FFFDF9) e detalhes em terracota suave.",
    preview: {
      primary: "#C25E38",
      accent: "#EFE4D4",
      bg: "#F7F3EB",
    },
  },
  {
    id: "blue",
    name: "Azul Corporativo",
    badge: "Executivo",
    description: "Elegante e sério, com azul ardósia e cobalto para foco analítico.",
    preview: {
      primary: "#2563eb",
      accent: "#60a5fa",
      bg: "#f8fafc",
    },
  },
  {
    id: "mint",
    name: "Verde Menta",
    badge: "Bio & Fresh",
    description: "Tons de verde menta e esmeralda para energia comercial e agilidade.",
    preview: {
      primary: "#059669",
      accent: "#34d399",
      bg: "#f0fdf4",
    },
  },
  {
    id: "lavender",
    name: "Lavanda Criativo",
    badge: "Inovação",
    description: "Tons de violeta suave e lilás pastel com ar descontraído e amigável.",
    preview: {
      primary: "#7c3aed",
      accent: "#c084fc",
      bg: "#faf5ff",
    },
  },
  {
    id: "dark",
    name: "Modo Escuro",
    badge: "Alto Contraste",
    description: "Fundo escuro profundo com detalhes fluorescentes suaves para a noite.",
    preview: {
      primary: "#34d399",
      accent: "#818cf8",
      bg: "#090d16",
    },
  },
];

const STORAGE_PALETTE_KEY = "alliar:color_palette";

export function getActivePalette(): ColorPalette {
  if (typeof window === "undefined") return "pastel";
  return (localStorage.getItem(STORAGE_PALETTE_KEY) as ColorPalette) || "pastel";
}

export function applyThemePalette(palette: ColorPalette, isDark = false) {
  if (typeof document === "undefined") return;

  const html = document.documentElement;

  // Remove classes anteriores
  html.classList.remove("theme-blue", "theme-mint", "theme-lavender", "dark");

  if (palette === "dark" || isDark) {
    html.classList.add("dark");
  } else if (palette === "blue") {
    html.classList.add("theme-blue");
  } else if (palette === "mint") {
    html.classList.add("theme-mint");
  } else if (palette === "lavender") {
    html.classList.add("theme-lavender");
  }
  // "pastel" usa as variáveis padrão de :root

  localStorage.setItem(STORAGE_PALETTE_KEY, palette);
}
