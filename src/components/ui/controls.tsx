import { SegmentedControl } from "@expo/ui/community/segmented-control";
import { useId, useState } from "react";
import {
  ActivityIndicator,
  InputAccessoryView,
  Keyboard,
  Platform,
  Switch,
  TextInput,
  useWindowDimensions,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { type SymbolViewProps } from "expo-symbols";
import { radius, useTheme } from "@/constants/theme";
import { Chevron, Copy, Icon, faded, styles } from "./typography";
import { Press } from "./motion";

export function IconButton({
  name,
  label,
  onPress,
  disabled = false,
  filled = false,
  size = 22,
  color,
}: Readonly<{
  name: SymbolViewProps["name"];
  label: string;
  onPress: () => void;
  disabled?: boolean;
  /** `true` for the standard muted disc, or a background colour. */
  filled?: boolean | string;
  size?: number;
  color?: string;
}>) {
  const colors = useTheme();

  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.iconButton,
        !!filled && {
          backgroundColor: filled === true ? colors.muted : filled,
          borderRadius: 22,
          minWidth: 44,
          minHeight: 44,
        },
        faded(disabled),
      ]}
    >
      {/* A glyph alone in a control reads at the weight of a button's label. */}
      <Icon name={name} size={size} color={color} weight="semibold" />
    </Press>
  );
}

export type ButtonVariant = "primary" | "secondary" | "tint" | "danger";

export function Button({
  title,
  onPress,
  variant = "primary",
  disabled = false,
  busy = false,
  compact = false,
  icon,
  style,
  testID,
  accessibilityLabel,
}: Readonly<{
  title: string;
  onPress: () => void;
  /** `tint` is a soft cobalt background for a secondary action. */
  variant?: ButtonVariant;
  disabled?: boolean;
  busy?: boolean;
  compact?: boolean;
  icon?: SymbolViewProps["name"];
  style?: StyleProp<ViewStyle>;
  /** Identifies the button for end-to-end flows. */
  testID?: string;
  /** Names the object when the title alone would not, such as "Bekreft". */
  accessibilityLabel?: string;
}>) {
  const colors = useTheme();

  const { foreground, background } = {
    primary: { foreground: colors.onPrimary, background: colors.primary },
    secondary: { foreground: colors.text, background: colors.muted },
    tint: { foreground: colors.primary, background: colors.primarySoft },
    danger: { foreground: colors.danger, background: colors.dangerSoft },
  }[variant];

  return (
    <Press
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={[
        {
          minHeight: compact ? 44 : 50,
          paddingVertical: compact ? 8 : 12,
          paddingHorizontal: compact ? 14 : 18,
          borderRadius: radius.control,
          borderCurve: "continuous",
          backgroundColor: background,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
        },
        style,
        faded(disabled && !busy),
      ]}
    >
      {busy ? (
        <ActivityIndicator color={foreground} />
      ) : icon ? (
        <Icon
          name={icon}
          size={compact ? 16 : 18}
          weight="semibold"
          color={foreground}
        />
      ) : null}
      <Copy
        weight="600"
        style={{ color: foreground, flexShrink: 1, textAlign: "center" }}
      >
        {title}
      </Copy>
    </Press>
  );
}

export function Chip({
  label,
  icon,
  tone = "muted",
  onPress,
  accessibilityLabel,
  trailing = "chevron",
}: Readonly<{
  label: string;
  icon?: SymbolViewProps["name"];
  tone?: "muted" | "warning" | "success";
  onPress?: () => void;
  accessibilityLabel?: string;
  /** Dropdown-style chips show a chevron; action chips do not. */
  trailing?: "chevron" | "none";
}>) {
  const colors = useTheme();

  const palette = {
    muted: { background: colors.muted, text: colors.text },
    warning: { background: colors.warningSoft, text: colors.warning },
    success: { background: colors.successSoft, text: colors.success },
  }[tone];

  return (
    <Press
      accessibilityRole={onPress ? "button" : "text"}
      accessibilityLabel={accessibilityLabel ?? label}
      disabled={!onPress}
      onPress={onPress}
      // A chip looks the same whether or not it opens something; the touch
      // target grows to 44 points around it instead of the chip itself.
      hitSlop={onPress ? { top: 7, bottom: 7 } : undefined}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        minHeight: 30,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: radius.chip,
        borderCurve: "continuous",
        backgroundColor: palette.background,
        alignSelf: "flex-start",
        maxWidth: "100%",
      }}
    >
      {icon && (
        <Icon name={icon} size={12} weight="semibold" color={palette.text} />
      )}
      <Copy
        role="detail"
        weight="600"
        style={{ color: palette.text, flexShrink: 1 }}
      >
        {label}
      </Copy>
      {onPress && trailing === "chevron" && (
        <Chevron direction="down" compact color={palette.text} />
      )}
    </Press>
  );
}

export function Field({
  label,
  style,
  hint,
  onFocus,
  onBlur,
  ...props
}: TextInputProps & { label: string; hint?: string }) {
  const colors = useTheme();
  const [focused, setFocused] = useState(false);
  const accessoryId = useId();

  return (
    <View style={{ gap: 6 }}>
      <Copy role="detail" weight="600" muted>
        {label}
      </Copy>
      <TextInput
        inputAccessoryViewID={Platform.OS === "ios" ? accessoryId : undefined}
        accessibilityLabel={label}
        placeholderTextColor={colors.secondary}
        selectionColor={colors.primary}
        {...props}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        style={[
          {
            minHeight: 52,
            borderWidth: 1.5,
            borderColor: focused ? colors.primary : colors.line,
            borderRadius: radius.control,
            borderCurve: "continuous",
            paddingHorizontal: 12,
            paddingVertical: 10,
            fontSize: 17,
            color: colors.text,
            backgroundColor: colors.surface,
          },
          style,
        ]}
      />
      {Platform.OS === "ios" && (
        <InputAccessoryView
          nativeID={accessoryId}
          backgroundColor={colors.surface}
        >
          <View style={{ alignItems: "flex-end", paddingHorizontal: 12 }}>
            <Button
              title="Ferdig"
              compact
              variant="secondary"
              onPress={Keyboard.dismiss}
            />
          </View>
        </InputAccessoryView>
      )}
      {!!hint && (
        <Copy role="caption" muted>
          {hint}
        </Copy>
      )}
    </View>
  );
}

export function Toggle({
  label,
  detail,
  value,
  onChange,
  disabled,
}: Readonly<{
  label: string;
  detail?: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}>) {
  const colors = useTheme();

  return (
    <View style={[styles.row, { minHeight: 44 }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Copy>{label}</Copy>
        {!!detail && (
          <Copy role="detail" muted>
            {detail}
          </Copy>
        )}
      </View>
      <Switch
        accessibilityLabel={label}
        value={value}
        disabled={disabled}
        onValueChange={onChange}
        trackColor={{ true: colors.primary }}
      />
    </View>
  );
}

export function Segments<T extends string>({
  value,
  options,
  onChange,
}: Readonly<{
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}>) {
  const colors = useTheme();

  const { fontScale } = useWindowDimensions();

  // The web build draws the same control in JavaScript for browser checks.
  if (Platform.OS !== "android" && fontScale <= 1.3)
    return (
      <View style={{ minHeight: 44, justifyContent: "center" }}>
        <SegmentedControl
          values={options.map((option) => option.label)}
          selectedIndex={options.findIndex((option) => option.value === value)}
          onChange={(event) => {
            const option = options[event.nativeEvent.selectedSegmentIndex];

            if (option) onChange(option.value);
          }}
          // iOS 26 draws the selected segment without the tint; so does web
          // when none is given.
          tintColor={Platform.OS === "ios" ? colors.primary : undefined}
          style={{ height: 44 }}
        />
      </View>
    );

  return (
    <View
      style={{
        flexDirection: fontScale > 1.3 ? "column" : "row",
        backgroundColor: colors.muted,
        padding: 4,
        borderRadius: radius.control,
        borderCurve: "continuous",
        gap: 4,
      }}
    >
      {options.map((option) => {
        const active = value === option.value;

        return (
          <Press
            feedback="highlight"
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(option.value)}
            style={{
              flex: fontScale > 1.3 ? undefined : 1,
              minHeight: 44,
              justifyContent: "center",
              alignItems: "center",
              backgroundColor: active ? colors.surface : "transparent",
              borderWidth: 1,
              borderColor: active ? colors.primary : "transparent",
              borderRadius: radius.control - 4,
              borderCurve: "continuous",
              padding: 8,
            }}
          >
            <Copy
              role="detail"
              weight="600"
              style={{
                color: active ? colors.primary : colors.secondary,
                textAlign: "center",
              }}
            >
              {option.label}
            </Copy>
          </Press>
        );
      })}
    </View>
  );
}
