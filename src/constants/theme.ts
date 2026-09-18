import { useColorScheme } from "react-native";

/**
 * Palette drawn from the Norwegian 1000-kroner note ("Havet som bærer oss videre"):
 * saturated violet numerals, lavender paper, the deep indigo of "TUSEN KRONER",
 * the sea's steel blue, and the periwinkle pixel bands with olive highlights on
 * the reverse side.
 */
const light = {
  background: "#F4F2FA",
  surface: "#FFFFFF",
  surfaceRaised: "#F9F7FD",
  text: "#26235A",
  secondary: "#6E6A93",
  primary: "#5B3FA6",
  primaryStrong: "#46308A",
  primarySoft: "#ECE7F8",
  onPrimary: "#FFFFFF",
  /** Large violet surfaces (hero cards). Kept deep in both schemes. */
  hero: "#5B3FA6",
  onHero: "#FFFFFF",
  onHeroMuted: "#FFFFFFCC",
  accent: "#3B628C",
  accentSoft: "#DFE8F2",
  line: "#E0DCEC",
  muted: "#ECE9F5",
  success: "#2F7A6A",
  successSoft: "#DFF0EA",
  warning: "#7C6410",
  warningSoft: "#F4EFD4",
  danger: "#B3302B",
  dangerSoft: "#F9E3E1",
  shadow: "rgba(38, 35, 90, 0.08)",
  scrim: "rgba(38, 35, 90, 0.55)",
};
const dark: typeof light = {
  background: "#14122A",
  surface: "#1E1B3A",
  surfaceRaised: "#252247",
  text: "#EEEAF8",
  secondary: "#A9A4CB",
  primary: "#BBA6F1",
  primaryStrong: "#D0C1F6",
  primarySoft: "#2E2754",
  onPrimary: "#1B1543",
  hero: "#3A2B7A",
  onHero: "#F1ECFB",
  onHeroMuted: "#F1ECFBCC",
  accent: "#8FB6DA",
  accentSoft: "#1F3247",
  line: "#37335C",
  muted: "#2B274D",
  success: "#7FD1BD",
  successSoft: "#1E3B35",
  warning: "#E5CE6A",
  warningSoft: "#3A3418",
  danger: "#FF9E97",
  dangerSoft: "#45201F",
  shadow: "rgba(0, 0, 0, 0)",
  scrim: "rgba(0, 0, 0, 0.6)",
};
export type Theme = typeof light;
export function useTheme(): Theme {
  return useColorScheme() === "dark" ? dark : light;
}
export const themes = { light, dark };

/** Colour bands from the note's pixel mosaic, ordered dark to light. */
export const mosaicPalette = [
  "#46308A",
  "#5B3FA6",
  "#7658C4",
  "#8F7BD8",
  "#7E93D6",
  "#A99DE4",
  "#C1B9EC",
  "#DAD5F2",
] as const;
/** Rare olive-yellow flecks, like the small squares beside the numerals. */
export const mosaicHighlight = "#B7B35C";

export const radius = {
  sheet: 24,
  card: 18,
  control: 14,
  chip: 10,
  inner: 8,
} as const;

export function tracking(size: number) {
  if (size >= 40) return -1.2;
  if (size >= 28) return -0.7;
  if (size >= 22) return -0.4;
  if (size >= 17) return -0.15;
  if (size <= 12) return 0.15;
  if (size <= 13) return 0.05;
  return 0;
}
