import { useColorScheme } from "react-native";

/** The camera stays dark in both colour schemes so the viewfinder reads as a photo. */
const camera = {
  cameraBackground: "#101C51",
  onCamera: "#F6F3EA",
  onCameraMuted: "#E3E7FF",
  cameraOverlay: "#101C51B3",
  cameraOverlayStrong: "#101C51CC",
  cameraGuide: "#FFFFFFCC",
};

/** Translucent layers over the cobalt hero, which is dark in both colour schemes. */
const heroLayers = {
  heroControl: "#FFFFFF22",
  heroTrack: "#FFFFFF33",
  heroMarker: "#FFFFFFAA",
  heroWarning: "#FFE3A1",
};

/** Catalogue product photos have white backgrounds in both colour schemes. */
const productImage = {
  productImageBackground: "#FFFFFF",
  productImagePlaceholder: "#777777",
};

/** Cobalt ink and warm paper. Artwork carries texture; controls stay plain. */
const light = {
  ...camera,
  ...heroLayers,
  ...productImage,
  background: "#F6F3EA",
  surface: "#FFFFFF",
  surfaceRaised: "#F0EDE3",
  text: "#152369",
  secondary: "#5F6380",
  primary: "#263CC7",
  primarySoft: "#E6E9FA",
  onPrimary: "#FFFFFF",
  /** Cobalt summary surfaces stay dark in both colour schemes. */
  hero: "#263CC7",
  onHero: "#FFFFFF",
  onHeroMuted: "#E3E7FF",
  line: "#D6D5CF",
  chart: ["#263CC7", "#4055CF", "#6375DC", "#8998E7"],
  onChart: ["#FFFFFF", "#FFFFFF", "#000000", "#101C51"],
  imageOutline: "rgba(0, 0, 0, 0.1)",
  muted: "#EAE8DF",
  success: "#2F7A6A",
  successSoft: "#DFF0EA",
  warning: "#7C6410",
  warningSoft: "#F4EFD4",
  danger: "#B3302B",
  dangerSoft: "#F9E3E1",
};

const dark: typeof light = {
  ...camera,
  ...heroLayers,
  ...productImage,
  background: "#10162D",
  surface: "#18203A",
  surfaceRaised: "#202A46",
  text: "#F6F3EA",
  secondary: "#B3BAD2",
  primary: "#A5B7FF",
  primarySoft: "#243261",
  onPrimary: "#101C51",
  hero: "#2033A8",
  onHero: "#F6F3EA",
  onHeroMuted: "#E3E7FF",
  line: "#35415D",
  chart: ["#A5B7FF", "#859BEE", "#687DD2", "#5065B5"],
  onChart: ["#101C51", "#101C51", "#000000", "#FFFFFF"],
  imageOutline: "rgba(255, 255, 255, 0.1)",
  muted: "#222D48",
  success: "#7FD1BD",
  successSoft: "#1E3B35",
  warning: "#E5CE6A",
  warningSoft: "#3A3418",
  danger: "#FF9E97",
  dangerSoft: "#45201F",
};

export type Theme = typeof light;

export function useTheme(): Theme {
  return useColorScheme() === "dark" ? dark : light;
}

/**
 * Corners by role. `tile` is the small icon tile or inset box inside a card;
 * circular controls use half their size instead.
 */
export const radius = {
  card: 24,
  control: 8,
  chip: 6,
  inner: 8,
  tile: 10,
} as const;

/** Disabled controls fade to this; pressed ones dim through `Press`. */
export const disabledOpacity = 0.45;

/**
 * Durations in milliseconds and cubic-bézier curves for the app's own motion.
 * Native tabs, stacks, sheets, and menus keep the system's timing.
 */
export const motion = {
  /** Press feedback, seen many times a day, so near-imperceptible. */
  press: 120,
  /** A small change a person asked for: a disclosure opening, a note arriving. */
  state: 200,
  /** Strong ease-out: starts fast, so the response feels immediate. */
  easeOut: [0.23, 1, 0.32, 1],
  /** Strong ease-in-out for something that turns or moves in place. */
  easeInOut: [0.77, 0, 0.175, 1],
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
