import { Image } from "expo-image";
import { useWindowDimensions, View } from "react-native";
import { Copy } from "./ui/typography";
import { useTheme } from "@/constants/theme";

import naveIllustration from "../../assets/artwork/nave.png";
import monumentIllustration from "../../assets/artwork/monument.png";

const illustrations = {
  nave: naveIllustration,
  monument: monumentIllustration,
};

/** Decorative artwork is separate from readable data and product photographs. */
export function MonumentArtwork({
  scene,
  compact = false,
}: Readonly<{
  scene: keyof typeof illustrations;
  compact?: boolean;
}>) {
  const { width, fontScale } = useWindowDimensions();

  // Give the amount all available space on narrow screens or with larger text.
  if (compact && (width < 375 || fontScale > 1.2)) return null;

  return (
    <Image
      source={illustrations[scene]}
      accessible={false}
      contentFit="cover"
      style={
        compact
          ? {
              width: 72,
              height: 110,
              borderTopLeftRadius: 36,
              borderTopRightRadius: 36,
            }
          : {
              width: "100%",
              maxWidth: 360,
              aspectRatio: 1.5,
              alignSelf: "center",
              borderTopLeftRadius: 4,
              borderTopRightRadius: 4,
            }
      }
    />
  );
}

export function IllustratedEmpty({
  scene,
  title,
  message,
}: Readonly<{
  scene: keyof typeof illustrations;
  title: string;
  message: string;
}>) {
  return (
    <View style={{ gap: 16, paddingVertical: 20 }}>
      <MonumentArtwork scene={scene} />
      {/* The screen-title role: this empty state stands in for a tab's content. */}
      <Copy
        accessibilityRole="header"
        size={24}
        weight="600"
        style={{ textAlign: "center" }}
      >
        {title}
      </Copy>
      <Copy muted style={{ textAlign: "center" }}>
        {message}
      </Copy>
    </View>
  );
}

/** The arch remains legible without the illustration at small sizes. */
export function ArchMark({ color }: Readonly<{ color?: string }>) {
  const colors = useTheme();

  return (
    <View
      accessible={false}
      style={{
        width: 24,
        height: 28,
        borderWidth: 3,
        borderBottomWidth: 0,
        borderColor: color ?? colors.primary,
        borderTopLeftRadius: 12,
        borderTopRightRadius: 12,
        padding: 4,
      }}
    >
      <View
        style={{
          flex: 1,
          borderWidth: 2,
          borderBottomWidth: 0,
          borderColor: color ?? colors.primary,
          borderTopLeftRadius: 6,
          borderTopRightRadius: 6,
        }}
      />
    </View>
  );
}
