import {
  StyleSheet,
  Text,
  type PressableStateCallbackType,
  type TextProps,
  type ViewStyle,
} from "react-native";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { tracking, useTheme } from "@/constants/theme";

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
  weight?: "400" | "500" | "600" | "700" | "800";
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
      name={name}
      size={size}
      weight={weight}
      tintColor={color ?? colors.primary}
    />
  );
}

/** Instant press feedback: a small scale plus a dim, no animation cost. */
export const pressed = (state: PressableStateCallbackType): ViewStyle =>
  state.pressed
    ? { opacity: 0.72, transform: [{ scale: 0.96 }] }
    : { opacity: 1 };

export const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
});
