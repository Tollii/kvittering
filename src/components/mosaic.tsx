import { View, type ViewStyle } from "react-native";
import { mosaicHighlight, mosaicPalette } from "@/constants/theme";

/** Generate each pattern with a local sequence that is reset for every call. */
function createMosaicBlocks(seed: number, columns: number, fade: boolean) {
  let state = seed >>> 0 || 1;

  const next = () => {
    state = (state * 1664525 + 1013904223) >>> 0;

    return state / 0xffffffff;
  };

  return Array.from({ length: columns }, (_, index) => {
    const position = index / Math.max(1, columns - 1);
    // Bias colours from dark violet on the left towards light lilac on the right.
    const centre = position * (mosaicPalette.length - 1);
    const pick = Math.round(centre + (next() - 0.5) * 3);
    const fleck = next() < 0.04;

    const colour = fleck
      ? mosaicHighlight
      : mosaicPalette[Math.min(mosaicPalette.length - 1, Math.max(0, pick))];

    const alpha = fade ? 1 - position * 0.55 : 1;

    return { key: index, colour, alpha: alpha * (0.7 + next() * 0.3) };
  });
}

/**
 * A thin band of colour blocks, after the pixel mosaic on the reverse of the
 * 1000-kroner note. Deterministic for a given seed so it never flickers.
 */
export function Mosaic({
  seed = 1000,
  height = 6,
  block = 4,
  columns = 48,
  fade = true,
  opacity = 1,
  style,
}: Readonly<{
  seed?: number;
  height?: number;
  block?: number;
  columns?: number;
  fade?: boolean;
  opacity?: number;
  style?: ViewStyle;
}>) {
  const blocks = createMosaicBlocks(seed, columns, fade);

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[
        { flexDirection: "row", height, gap: 1, opacity, overflow: "hidden" },
        style,
      ]}
    >
      {blocks.map((item) => (
        <View
          key={item.key}
          style={{
            width: block,
            height,
            backgroundColor: item.colour,
            opacity: item.alpha,
            borderRadius: 1,
          }}
        />
      ))}
    </View>
  );
}
