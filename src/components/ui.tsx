import { useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type PressableStateCallbackType,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type ViewStyle,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { router } from "expo-router";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { radius, tracking, useTheme } from "@/constants/theme";

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
}: {
  name: SymbolViewProps["name"];
  size?: number;
  color?: string;
  weight?: SymbolViewProps["weight"];
}) {
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
    ? { opacity: 0.72, transform: [{ scale: 0.97 }] }
    : { opacity: 1 };

export function IconButton({
  name,
  label,
  onPress,
  disabled = false,
  filled = false,
  size = 22,
  color,
}: {
  name: SymbolViewProps["name"];
  label: string;
  onPress: () => void;
  disabled?: boolean;
  /** `true` for the standard muted disc, or a background colour. */
  filled?: boolean | string;
  size?: number;
  color?: string;
}) {
  const colors = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      style={(state) => [
        styles.iconButton,
        !!filled && {
          backgroundColor: typeof filled === "string" ? filled : colors.muted,
          borderRadius: 22,
          minWidth: 40,
          minHeight: 40,
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
}: {
  title: string;
  onPress: () => void;
  secondary?: boolean;
  /** Soft primary: a lilac field with violet text, for the second-most important action. */
  tint?: boolean;
  danger?: boolean;
  disabled?: boolean;
  busy?: boolean;
  compact?: boolean;
  icon?: SymbolViewProps["name"];
}) {
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
          minHeight: compact ? 40 : 50,
          paddingVertical: compact ? 8 : 12,
          paddingHorizontal: compact ? 14 : 18,
          borderRadius: compact ? 12 : radius.control,
          borderCurve: "continuous",
          backgroundColor: background,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
        },
        pressed(state),
        (disabled || busy) && { opacity: 0.45 },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={foreground} />
      ) : icon ? (
        <Icon name={icon} size={compact ? 16 : 18} color={foreground} />
      ) : null}
      <Copy
        weight="600"
        size={compact ? 15 : 16}
        style={{ color: foreground, flexShrink: 1 }}
      >
        {title}
      </Copy>
    </Pressable>
  );
}
export function Panel({
  children,
  style,
  tone = "surface",
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  tone?: "surface" | "primary" | "soft" | "plain";
}) {
  const colors = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor:
            tone === "primary"
              ? colors.hero
              : tone === "soft"
                ? colors.primarySoft
                : tone === "plain"
                  ? colors.surfaceRaised
                  : colors.surface,
          borderRadius: radius.card,
          borderCurve: "continuous",
          padding: 16,
          gap: 10,
          overflow: "hidden",
        },
        tone === "surface" && {
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.line,
          boxShadow: `0 1px 2px ${colors.shadow}, 0 6px 16px ${colors.shadow}`,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
export function SectionTitle({
  title,
  detail,
  action,
  onAction,
}: {
  title: string;
  detail?: string;
  action?: string;
  onAction?: () => void;
}) {
  const colors = useTheme();
  return (
    <View style={[styles.row, { paddingTop: 10, paddingBottom: 2 }]}>
      <View style={{ flex: 1, gap: 1 }}>
        <Copy accessibilityRole="header" size={19} weight="700">
          {title}
        </Copy>
        {!!detail && (
          <Copy size={13} muted>
            {detail}
          </Copy>
        )}
      </View>
      {!!action && onAction && (
        <Pressable
          accessibilityRole="button"
          onPress={onAction}
          hitSlop={8}
          style={(state) => [
            { minHeight: 36, justifyContent: "center", paddingLeft: 12 },
            pressed(state),
          ]}
        >
          <Copy size={14} weight="600" style={{ color: colors.primary }}>
            {action}
          </Copy>
        </Pressable>
      )}
    </View>
  );
}
export function Chip({
  label,
  icon,
  tone = "muted",
  onPress,
  accessibilityLabel,
  trailing = "chevron",
}: {
  label: string;
  icon?: SymbolViewProps["name"];
  tone?: "muted" | "primary" | "warning" | "success" | "accent";
  onPress?: () => void;
  accessibilityLabel?: string;
  /** Dropdown-style chips show a chevron; action chips do not. */
  trailing?: "chevron" | "none";
}) {
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
      hitSlop={6}
      style={(state) => [
        {
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
        },
        onPress ? pressed(state) : null,
      ]}
    >
      {icon && <Icon name={icon} size={12} color={palette.text} />}
      <Copy
        size={13}
        weight="600"
        numberOfLines={1}
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
export function Disclosure({
  title,
  value,
  children,
  initiallyOpen = false,
}: {
  title: string;
  value?: string;
  children: ReactNode;
  initiallyOpen?: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const colors = useTheme();
  return (
    <Panel style={{ gap: open ? 10 : 0 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
        style={({ pressed: down }) => [
          styles.row,
          { minHeight: 44, opacity: down ? 0.6 : 1 },
        ]}
      >
        <Copy weight="600" style={{ flex: 1 }}>
          {title}
        </Copy>
        {!!value && (
          <Copy size={13} muted>
            {value}
          </Copy>
        )}
        <Icon
          name={open ? "chevron.up" : "chevron.down"}
          size={12}
          color={colors.secondary}
        />
      </Pressable>
      {open && children}
    </Panel>
  );
}
export function Screen({
  children,
  title,
  subtitle,
  settings = false,
  insetTop = true,
  footer,
  headerRight,
}: {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  settings?: boolean;
  insetTop?: boolean;
  footer?: ReactNode;
  headerRight?: ReactNode;
}) {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const header = !!title && (
    <View style={[styles.row, { alignItems: "flex-end", paddingBottom: 4 }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Copy accessibilityRole="header" size={30} weight="800">
          {title}
        </Copy>
        {!!subtitle && (
          <Copy muted size={14} weight="500">
            {subtitle}
          </Copy>
        )}
      </View>
      {headerRight}
      {settings && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Husstanden og innstillinger"
          onPress={() => router.push("/settings")}
          hitSlop={6}
          style={(state) => [
            styles.iconButton,
            {
              backgroundColor: colors.muted,
              borderRadius: 20,
              minWidth: 40,
              minHeight: 40,
            },
            pressed(state),
          ]}
        >
          <Icon name="person.2" size={18} color={colors.primary} />
        </Pressable>
      )}
    </View>
  );
  const content = (
    <View
      style={{
        padding: 16,
        paddingBottom: footer ? 16 : 32,
        gap: 12,
        maxWidth: 760,
        width: "100%",
        alignSelf: "center",
        flexGrow: 1,
      }}
    >
      {header}
      {children}
    </View>
  );
  return (
    <SafeAreaView
      edges={insetTop ? ["top", "left", "right"] : ["left", "right"]}
      style={{ flex: 1, backgroundColor: colors.background }}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          style={{ flex: 1 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{ flexGrow: 1 }}
        >
          {content}
        </ScrollView>
        {footer && (
          <View
            style={{
              paddingHorizontal: 16,
              paddingTop: 12,
              paddingBottom: Math.max(insets.bottom, 12),
              gap: 8,
              backgroundColor: colors.surface,
              borderTopWidth: StyleSheet.hairlineWidth,
              borderColor: colors.line,
            }}
          >
            {footer}
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
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
  return (
    <View style={{ gap: 6 }}>
      <Copy size={13} weight="600" muted>
        {label}
      </Copy>
      <TextInput
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
            minHeight: 48,
            borderWidth: 1.5,
            borderColor: focused ? colors.primary : colors.line,
            borderRadius: 12,
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
}: {
  label: string;
  detail?: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
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
export function Notice({
  children,
  error = false,
  tone,
  icon,
}: {
  children: ReactNode;
  error?: boolean;
  tone?: "info" | "warning" | "error" | "success";
  icon?: SymbolViewProps["name"];
}) {
  const colors = useTheme();
  const kind = tone ?? (error ? "error" : "info");
  const palette = {
    info: {
      background: colors.primarySoft,
      text: colors.text,
      accent: colors.primary,
      icon: "info.circle" as const,
    },
    warning: {
      background: colors.warningSoft,
      text: colors.warning,
      accent: colors.warning,
      icon: "exclamationmark.triangle" as const,
    },
    error: {
      background: colors.dangerSoft,
      text: colors.danger,
      accent: colors.danger,
      icon: "exclamationmark.circle" as const,
    },
    success: {
      background: colors.successSoft,
      text: colors.success,
      accent: colors.success,
      icon: "checkmark.circle" as const,
    },
  }[kind];
  return (
    <View
      style={{
        flexDirection: "row",
        gap: 10,
        padding: 12,
        paddingLeft: 14,
        borderRadius: radius.control,
        borderCurve: "continuous",
        backgroundColor: palette.background,
        alignItems: "flex-start",
      }}
    >
      <View style={{ paddingTop: 2 }}>
        <Icon name={icon ?? palette.icon} size={16} color={palette.accent} />
      </View>
      <Copy
        size={15}
        accessibilityRole={kind === "error" ? "alert" : undefined}
        style={{ color: palette.text, flex: 1 }}
      >
        {children}
      </Copy>
    </View>
  );
}
export function Loading({ title = "Henter …" }: { title?: string }) {
  return (
    <View style={{ padding: 28, gap: 12, alignItems: "center" }}>
      <ActivityIndicator />
      <Copy muted>{title}</Copy>
    </View>
  );
}
export function Empty({
  title,
  message,
  icon = "tray",
  children,
}: {
  title: string;
  message?: string;
  icon?: SymbolViewProps["name"];
  children?: ReactNode;
}) {
  const colors = useTheme();
  return (
    <Panel style={{ paddingVertical: 32, alignItems: "center", gap: 8 }}>
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: 32,
          backgroundColor: colors.primarySoft,
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 6,
        }}
      >
        <Icon name={icon} size={28} />
      </View>
      <Copy size={20} weight="700" style={{ textAlign: "center" }}>
        {title}
      </Copy>
      {!!message && (
        <Copy muted style={{ textAlign: "center", maxWidth: 300 }}>
          {message}
        </Copy>
      )}
      {children && <View style={{ paddingTop: 8, gap: 8 }}>{children}</View>}
    </Panel>
  );
}
export function Row({
  title,
  detail,
  value,
  icon,
  onPress,
  selected = false,
}: {
  title: string;
  detail?: string;
  value?: string;
  icon?: SymbolViewProps["name"];
  onPress?: () => void;
  selected?: boolean;
}) {
  const colors = useTheme();
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityState={onPress ? { selected } : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed: down }) => [
        styles.row,
        { minHeight: 44, paddingVertical: 4, opacity: down ? 0.6 : 1 },
      ]}
    >
      {icon && (
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: 9,
            borderCurve: "continuous",
            backgroundColor: colors.surface,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.line,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name={icon} size={15} />
        </View>
      )}
      <View style={{ flex: 1, gap: 2 }}>
        <Copy weight="600">{title}</Copy>
        {!!detail && (
          <Copy size={13} muted>
            {detail}
          </Copy>
        )}
      </View>
      {!!value && (
        <Copy weight="600" style={{ flexShrink: 1 }}>
          {value}
        </Copy>
      )}
      {selected && <Icon name="checkmark" size={15} weight="semibold" />}
      {onPress && !selected && (
        <Icon name="chevron.right" size={13} color={colors.secondary} />
      )}
    </Pressable>
  );
}
export function Segments<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  const colors = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        backgroundColor: colors.muted,
        borderRadius: 12,
        borderCurve: "continuous",
        padding: 3,
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
            style={{
              flex: 1,
              minHeight: 40,
              justifyContent: "center",
              alignItems: "center",
              borderRadius: 9,
              borderCurve: "continuous",
              padding: 6,
              backgroundColor: active ? colors.surface : "transparent",
              boxShadow: active ? `0 1px 3px ${colors.shadow}` : undefined,
            }}
          >
            <Copy
              size={14}
              weight="600"
              style={{ color: active ? colors.text : colors.secondary }}
            >
              {option.label}
            </Copy>
          </Pressable>
        );
      })}
    </View>
  );
}
export function Sheet({
  title,
  visible,
  onClose,
  children,
  header,
  footer,
}: {
  title: string;
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  header?: ReactNode;
  footer?: ReactNode;
}) {
  const colors = useTheme();
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <View
          style={[
            styles.row,
            { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
          ]}
        >
          <Copy size={20} weight="700" style={{ flex: 1 }}>
            {title}
          </Copy>
          <IconButton
            name="xmark"
            label="Lukk"
            size={15}
            filled
            color={colors.text}
            onPress={onClose}
          />
        </View>
        {header && (
          <View style={{ paddingHorizontal: 16, paddingBottom: 10, gap: 10 }}>
            {header}
          </View>
        )}
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            contentContainerStyle={{
              padding: 16,
              paddingTop: 4,
              gap: 10,
              paddingBottom: 24,
            }}
          >
            {children}
          </ScrollView>
          {footer && (
            <View
              style={{
                paddingHorizontal: 16,
                paddingVertical: 10,
                gap: 8,
                backgroundColor: colors.surface,
                borderTopWidth: StyleSheet.hairlineWidth,
                borderColor: colors.line,
              }}
            >
              {footer}
            </View>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}
export function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string | null;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  return (
    <>
      <Row
        title={label}
        detail={
          options.find((option) => option.value === value)?.label ??
          "Ikke valgt"
        }
        onPress={() => setOpen(true)}
      />
      <Sheet title={label} visible={open} onClose={() => setOpen(false)}>
        {options.length > 12 && (
          <Field label="Søk" value={search} onChangeText={setSearch} />
        )}
        <Panel style={{ gap: 2 }}>
          {options
            .filter((option) =>
              option.label
                .toLocaleLowerCase("nb-NO")
                .includes(search.toLocaleLowerCase("nb-NO")),
            )
            .map((option) => (
              <Row
                key={option.value}
                title={option.label}
                selected={option.value === value}
                onPress={() => {
                  onChange(option.value);
                  setOpen(false);
                  setSearch("");
                }}
              />
            ))}
        </Panel>
      </Sheet>
    </>
  );
}
export const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
});
