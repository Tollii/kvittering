import { Image } from "expo-image";
import { useWindowDimensions, View } from "react-native";
import { Copy } from "./ui/typography";
import { useTheme } from "@/constants/theme";

import inboxIllustration from "../../assets/artwork/inbox-nave.png";
import historyIllustration from "../../assets/artwork/history-monument.png";

const illustrations = {
  inbox: inboxIllustration,
  history: historyIllustration,
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
              aspectRatio: scene === "inbox" ? 1 : 1.5,
              alignSelf: "center",
              borderTopLeftRadius: scene === "inbox" ? 180 : 4,
              borderTopRightRadius: scene === "inbox" ? 180 : 4,
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
      <Copy
        accessibilityRole="header"
        size={25}
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
