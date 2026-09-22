import { SegmentedControl } from "@expo/ui/community/segmented-control";
import {
  InputAccessoryView,
  Keyboard,
  Platform,
  useWindowDimensions,
} from "react-native";
import { useId, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Switch,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { type SymbolViewProps } from "expo-symbols";
import { radius, useTheme } from "@/constants/theme";
import { Copy, Icon, pressed, styles } from "./typography";

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
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={(state) => [
        styles.iconButton,
        !!filled && {
          backgroundColor: filled === true ? colors.muted : filled,
          borderRadius: 22,
          minWidth: 44,
          minHeight: 44,
        },
        { opacity: disabled ? 0.35 : state.pressed ? 0.6 : 1 },
      ]}
    >
      <Icon name={name} size={size} color={color} />
    </Pressable>
  );
}

export function Button({
  title,
  onPress,
  secondary = false,
  tint = false,
  danger = false,
  disabled = false,
  busy = false,
  compact = false,
  icon,
  style,
}: Readonly<{
  title: string;
  onPress: () => void;
  secondary?: boolean;
  /** Soft cobalt background for a secondary action. */
  tint?: boolean;
  danger?: boolean;
  disabled?: boolean;
  busy?: boolean;
  compact?: boolean;
  icon?: SymbolViewProps["name"];
  style?: StyleProp<ViewStyle>;
}>) {
  const colors = useTheme();

  const foreground = danger
    ? colors.danger
    : secondary
      ? colors.text
      : tint
        ? colors.primary
        : colors.onPrimary;

  const background = danger
    ? colors.dangerSoft
    : secondary
      ? colors.muted
      : tint
        ? colors.primarySoft
        : colors.primary;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={(state) => [
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
        pressed(state),
        disabled && !busy && { opacity: 0.45 },
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
        size={compact ? 15 : 16}
        style={{ color: foreground, flexShrink: 1, textAlign: "center" }}
      >
        {title}
      </Copy>
    </Pressable>
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
  tone?: "muted" | "primary" | "warning" | "success" | "accent";
  onPress?: () => void;
  accessibilityLabel?: string;
  /** Dropdown-style chips show a chevron; action chips do not. */
  trailing?: "chevron" | "none";
}>) {
  const colors = useTheme();

  const palette = {
    muted: { background: colors.muted, text: colors.text },
    primary: { background: colors.primarySoft, text: colors.primary },
    warning: { background: colors.warningSoft, text: colors.warning },
    success: { background: colors.successSoft, text: colors.success },
    accent: { background: colors.accentSoft, text: colors.accent },
  }[tone];

  return (
    <Pressable
      accessibilityRole={onPress ? "button" : "text"}
      accessibilityLabel={accessibilityLabel ?? label}
      disabled={!onPress}
      onPress={onPress}
      style={(state) => [
        {
          flexDirection: "row",
          alignItems: "center",
          gap: 5,
          minHeight: onPress ? 44 : 30,
          paddingHorizontal: 10,
          paddingVertical: 5,
          borderRadius: radius.chip,
          borderCurve: "continuous",
          backgroundColor: palette.background,
          alignSelf: "flex-start",
          maxWidth: "100%",
        },
        onPress ? pressed(state) : null,
      ]}
    >
      {icon && <Icon name={icon} size={12} color={palette.text} />}
      <Copy
        size={14}
        weight="600"
        style={{ color: palette.text, flexShrink: 1 }}
      >
        {label}
      </Copy>
      {onPress && trailing === "chevron" && (
        <Icon name="chevron.down" size={9} color={palette.text} />
      )}
    </Pressable>
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
      <Copy size={13} weight="600" muted>
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
              secondary
              onPress={Keyboard.dismiss}
            />
          </View>
        </InputAccessoryView>
      )}
      {!!hint && (
        <Copy size={12} muted>
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
          <Copy size={13} muted>
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

  if (Platform.OS === "ios" && fontScale <= 1.3)
    return (
      <View style={{ minHeight: 44, justifyContent: "center" }}>
        <SegmentedControl
          values={options.map((option) => option.label)}
          selectedIndex={options.findIndex((option) => option.value === value)}
          onChange={(event) => {
            const option = options[event.nativeEvent.selectedSegmentIndex];

            if (option) onChange(option.value);
          }}
          tintColor={colors.primary}
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
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(option.value)}
            style={(state) => [
              {
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
              },
              pressed(state),
            ]}
          >
            <Copy
              size={14}
              weight="600"
              style={{
                color: active ? colors.primary : colors.secondary,
                textAlign: "center",
              }}
            >
              {option.label}
            </Copy>
          </Pressable>
        );
      })}
    </View>
  );
}
