import {
  StyleSheet,
  Text,
  View,
  type PressableStateCallbackType,
  type TextProps,
  type ViewStyle,
} from "react-native";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { disabledOpacity, tracking, useTheme } from "@/constants/theme";

export function Copy({
  children,
  muted = false,
  size = 16,
  weight = "400",
  style,
  ...props
}: TextProps & {
  muted?: boolean;
  size?: number;
  weight?: "400" | "500" | "600" | "700";
}) {
  const colors = useTheme();

  return (
    <Text
      {...props}
      style={[
        {
          color: muted ? colors.secondary : colors.text,
          fontSize: size,
          fontWeight: weight,
          lineHeight: Math.round(
            size * (size >= 28 ? 1.12 : size >= 22 ? 1.2 : 1.32),
          ),
          letterSpacing: tracking(size),
          fontVariant: ["tabular-nums"],
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

/**
 * A large amount that a screen or sheet leads with, and the one line that
 * explains it. `hero` puts it on the cobalt summary band; otherwise it opens
 * a sheet or a detail view on paper.
 */
export function Amount({
  hero = false,
  detail,
  style,
  ...props
}: TextProps & { hero?: boolean; detail?: string }) {
  const colors = useTheme();

  const amount = (
    <Copy
      selectable
      size={hero ? 36 : 32}
      weight={hero ? "600" : "700"}
      style={[hero && { color: colors.onHero }, style]}
      {...props}
    />
  );

  if (!detail) return amount;

  return (
    <View style={{ gap: 2 }}>
      {amount}
      <Copy
        size={13}
        muted={!hero}
        style={hero && { color: colors.onHeroMuted }}
      >
        {detail}
      </Copy>
    </View>
  );
}

export function Icon({
  name,
  size = 22,
  color,
  weight,
}: Readonly<{
  name: SymbolViewProps["name"];
  size?: number;
  color?: string;
  weight?: SymbolViewProps["weight"];
}>) {
  const colors = useTheme();

  return (
    <SymbolView
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no"
      name={name}
      size={size}
      weight={weight}
      tintColor={color ?? colors.primary}
    />
  );
}

/** Opacity feedback also respects the Reduce Motion preference. */
export const pressed = (state: PressableStateCallbackType): ViewStyle =>
  state.pressed ? { opacity: 0.72 } : { opacity: 1 };

/** The one disabled look: a faded control that keeps its layout. */
export const faded = (disabled: boolean): ViewStyle =>
  disabled ? { opacity: disabledOpacity } : {};

export const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
});
