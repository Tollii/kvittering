import {
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type StyleProp,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { createContext, useContext } from "react";
import { type SymbolViewProps } from "expo-symbols";
import { SymbolView } from "./symbol";
import {
  disabledOpacity,
  largeTextScale,
  typeScale,
  useTheme,
  type FontWeight,
  type TypeRole,
} from "@/constants/theme";

/**
 * Whether the person uses an accessibility text size, where a layout changes
 * shape rather than squeezing. Every component that adapts reads this one
 * threshold, so the whole app changes shape at the same size.
 */
export function useLargeText(): boolean {
  return useWindowDimensions().fontScale > largeTextScale;
}

/**
 * Whether a one-line value may shrink to fit. The receipt row's native context
 * menu provides `false`: inside its SwiftUI host React Native lays shrinking
 * text out at its smallest size, about 4 points. `TitleValue` and `Amount`
 * read it; any other text that shrinks inside such a host must read it too.
 */
export const ShrinkToFit = createContext(true);

/**
 * `role` names the type role; accessibility semantics go through
 * `accessibilityRole`. `style` cannot touch what the role owns.
 */
type TypeProps = Omit<
  TextProps,
  "role" | "style" | "maxFontSizeMultiplier" | "allowFontScaling"
> & {
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
      // iOS pushes a lone last word onto the line before it, as UILabel does.
      lineBreakStrategyIOS="standard"
      // Each role stops growing where its iOS text style does.
      maxFontSizeMultiplier={scale.maxScale}
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
  const shrink = useContext(ShrinkToFit);

  const amount = (
    <Type
      selectable
      // A number never breaks across lines; a long one shrinks to fit.
      numberOfLines={1}
      adjustsFontSizeToFit={shrink}
      minimumFontScale={0.5}
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
 * The chevron of anything that navigates, opens, expands, or goes back. One
 * size and weight everywhere, semibold like the text it sits beside and the
 * system's own disclosure indicators; `compact` is the smaller one inside a
 * chip, and a back link colours it `primary`.
 */
export function Chevron({
  direction = "right",
  color,
  compact = false,
}: Readonly<{
  direction?: "right" | "down" | "left";
  color?: string;
  compact?: boolean;
}>) {
  const colors = useTheme();

  return (
    <Icon
      name={`chevron.${direction}`}
      size={compact ? 10 : 13}
      weight="semibold"
      color={color ?? colors.secondary}
    />
  );
}

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
