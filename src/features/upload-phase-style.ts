import type { SymbolViewProps } from "expo-symbols";
import type { Theme } from "@/constants/theme";
import type { UploadPhase, UploadTone } from "@/lib/upload-queue";

/** The symbol for a phase that has stopped; a phase in progress shows a spinner. */
export const phaseSymbol = {
  uploading: null,
  offline: null,
  deferred: "hourglass",
  failed: "arrow.clockwise.circle",
  rejected: "exclamationmark.circle",
  regroup: "exclamationmark.circle",
} as const satisfies Record<
  UploadPhase["kind"],
  SymbolViewProps["name"] | null
>;

/** A failure is a warning: the images are safe and wait for the person. */
export function toneColor(tone: UploadTone, colors: Theme) {
  switch (tone) {
    case "active":
      return colors.primary;
    case "waiting":
      return colors.secondary;
    case "attention":
      return colors.warning;
  }
}
