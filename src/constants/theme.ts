import { useColorScheme } from "react-native";

/** Cobalt ink and warm paper. Artwork carries texture; controls stay plain. */
const light = {
  background: "#F6F3EA",
  surface: "#FFFFFF",
  surfaceRaised: "#F0EDE3",
  text: "#152369",
  secondary: "#5F6380",
  primary: "#263CC7",
  primaryStrong: "#1B2C9B",
  primarySoft: "#E6E9FA",
  onPrimary: "#FFFFFF",
  /** Cobalt summary surfaces stay dark in both colour schemes. */
  hero: "#263CC7",
  onHero: "#FFFFFF",
  onHeroMuted: "#E3E7FF",
  accent: "#263CC7",
  accentSoft: "#E6E9FA",
  line: "#D6D5CF",
  chart: ["#263CC7", "#4055CF", "#6375DC", "#8998E7"],
  muted: "#EAE8DF",
  success: "#2F7A6A",
  successSoft: "#DFF0EA",
  warning: "#7C6410",
  warningSoft: "#F4EFD4",
  danger: "#B3302B",
  dangerSoft: "#F9E3E1",
  shadow: "rgba(21, 35, 105, 0.08)",
  scrim: "rgba(16, 22, 45, 0.55)",
};

const dark: typeof light = {
  background: "#10162D",
  surface: "#18203A",
  surfaceRaised: "#202A46",
  text: "#F6F3EA",
  secondary: "#B3BAD2",
  primary: "#A5B7FF",
  primaryStrong: "#CED7FF",
  primarySoft: "#243261",
  onPrimary: "#101C51",
  hero: "#2033A8",
  onHero: "#F6F3EA",
  onHeroMuted: "#E3E7FF",
  accent: "#A5B7FF",
  accentSoft: "#243261",
  line: "#35415D",
  chart: ["#A5B7FF", "#859BEE", "#687DD2", "#5065B5"],
  muted: "#222D48",
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

export const radius = {
  sheet: 24,
  card: 8,
  control: 8,
  chip: 6,
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
