import {
  StyleSheet,
  Text,
  View,
  type PressableStateCallbackType,
  type StyleProp,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { type SymbolViewProps } from "expo-symbols";
import { SymbolView } from "./symbol";
import {
  disabledOpacity,
  motion,
  typeScale,
  useTheme,
  type FontWeight,
  type TypeRole,
} from "@/constants/theme";

/**
 * `role` names the type role; accessibility semantics go through
 * `accessibilityRole`. `style` cannot touch what the role owns.
 */
type TypeProps = Omit<TextProps, "role" | "style"> & {
  role: TypeRole;
  /** Overrides the role's weight; weight carries meaning, size does not. */
  weight?: FontWeight;
  muted?: boolean;
  style?: StyleProp<
    Omit<TextStyle, "fontSize" | "lineHeight" | "letterSpacing" | "fontWeight">
  >;
};

/** Draws one role of the type scale; `Copy` and `Amount` are its two faces. */
function Type({ role, weight, muted = false, style, ...props }: TypeProps) {
  const colors = useTheme();
  const scale = typeScale[role];

  return (
    <Text
      {...props}
      style={[
        {
          color: muted ? colors.secondary : colors.text,
          fontSize: scale.size,
          fontWeight: weight ?? scale.weight,
          lineHeight: scale.lineHeight,
          letterSpacing: scale.tracking,
          fontVariant: ["tabular-nums"],
        },
        style,
      ]}
    />
  );
}

/** The text roles; amounts go through `Amount`. */
type CopyRole = Exclude<TypeRole, "heroAmount" | "amount">;

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
}: Omit<TypeProps, "role" | "weight"> & { hero?: boolean; detail?: string }) {
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

/**
 * Superseded by `Press`; kept only until the category picker, the line
 * editor, and capture review move to it.
 */
export const pressed = (state: PressableStateCallbackType): ViewStyle =>
  state.pressed ? { opacity: motion.highlightOpacity } : { opacity: 1 };

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
