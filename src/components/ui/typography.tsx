import {
  StyleSheet,
  Text,
  View,
  type PressableStateCallbackType,
  type TextProps,
  type ViewStyle,
} from "react-native";
import { type SymbolViewProps } from "expo-symbols";
import { SymbolView } from "./symbol";
import {
  disabledOpacity,
  tracking,
  typeScale,
  useTheme,
  type FontWeight,
  type TypeRole,
} from "@/constants/theme";

/** `role` names the type role; accessibility semantics go through `accessibilityRole`. */
type TypeProps = Omit<TextProps, "role"> & {
  role: TypeRole;
  /** Overrides the role's weight; weight carries meaning, size does not. */
  weight?: FontWeight;
  muted?: boolean;
};

/** Draws one role of the type scale; `Copy` and `Amount` are its two faces. */
function Type({ role, weight, muted = false, style, ...props }: TypeProps) {
  const colors = useTheme();
  const { size, weight: roleWeight } = typeScale[role];

  return (
    <Text
      {...props}
      style={[
        {
          color: muted ? colors.secondary : colors.text,
          fontSize: size,
          fontWeight: weight ?? roleWeight,
          lineHeight: Math.round(
            size * (size >= 28 ? 1.12 : size >= 22 ? 1.2 : 1.32),
          ),
          letterSpacing: tracking(size),
          fontVariant: ["tabular-nums"],
        },
        style,
      ]}
    />
  );
}

/** The text roles; amounts go through `Amount`. */
export type CopyRole = Exclude<TypeRole, "heroAmount" | "amount">;

export function Copy({
  role = "body",
  ...props
}: Omit<TypeProps, "role"> & { role?: CopyRole }) {
  return <Type role={role} {...props} />;
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
}: Omit<TextProps, "role"> & { hero?: boolean; detail?: string }) {
  const colors = useTheme();

  const amount = (
    <Type
      selectable
      role={hero ? "heroAmount" : "amount"}
      style={[hero && { color: colors.onHero }, style]}
      {...props}
    />
  );

  if (!detail) return amount;

  return (
    <View style={{ gap: 2 }}>
      {amount}
      <Copy
        role="detail"
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
