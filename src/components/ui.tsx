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
import { useTheme } from "@/constants/theme";

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
          lineHeight: size * (size >= 24 ? 1.2 : 1.3),
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
}: {
  name: SymbolViewProps["name"];
  size?: number;
  color?: string;
}) {
  const colors = useTheme();
  return (
    <SymbolView name={name} size={size} tintColor={color ?? colors.primary} />
  );
}
export function IconButton({
  name,
  label,
  onPress,
  disabled = false,
}: {
  name: SymbolViewProps["name"];
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconButton,
        { opacity: disabled ? 0.4 : pressed ? 0.6 : 1 },
      ]}
    >
      <Icon name={name} size={22} />
    </Pressable>
  );
}
export function Button({
  title,
  onPress,
  secondary = false,
  danger = false,
  disabled = false,
  busy = false,
  icon,
}: {
  title: string;
  onPress: () => void;
  secondary?: boolean;
  danger?: boolean;
  disabled?: boolean;
  busy?: boolean;
  icon?: SymbolViewProps["name"];
}) {
  const colors = useTheme();
  const foreground = danger
    ? colors.danger
    : secondary
      ? colors.primary
      : colors.onPrimary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        {
          minHeight: 48,
          paddingVertical: 10,
          paddingHorizontal: 16,
          borderRadius: 14,
          backgroundColor: secondary || danger ? colors.muted : colors.primary,
          opacity: disabled || busy ? 0.5 : pressed ? 0.75 : 1,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
        },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={foreground} />
      ) : icon ? (
        <Icon name={icon} color={foreground} />
      ) : null}
      <Copy weight="600" style={{ color: foreground, flexShrink: 1 }}>
        {title}
      </Copy>
    </Pressable>
  );
}
export function Panel({
  children,
  style,
}: {
  children: ReactNode;
  style?: ViewStyle;
}) {
  const colors = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: colors.surface,
          borderRadius: 16,
          borderCurve: "continuous",
          padding: 14,
          gap: 10,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.line,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
export function Disclosure({
  title,
  value,
  children,
}: {
  title: string;
  value?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Panel style={{ gap: open ? 10 : 0 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
        style={({ pressed }) => [
          styles.row,
          { minHeight: 44, opacity: pressed ? 0.6 : 1 },
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
        <Icon name={open ? "chevron.up" : "chevron.down"} size={13} />
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
}: {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  settings?: boolean;
  insetTop?: boolean;
  footer?: ReactNode;
}) {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
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
          contentContainerStyle={{
            padding: 16,
            paddingBottom: footer ? 16 : 32,
            gap: 12,
            maxWidth: 760,
            width: "100%",
            alignSelf: "center",
          }}
        >
          {!!title && (
            <View style={styles.row}>
              <View style={{ flex: 1, gap: 3 }}>
                <Copy accessibilityRole="header" size={26} weight="700">
                  {title}
                </Copy>
                {!!subtitle && (
                  <Copy muted size={13}>
                    {subtitle}
                  </Copy>
                )}
              </View>
              {settings && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Husstanden"
                  onPress={() => router.push("/settings")}
                  style={styles.iconButton}
                >
                  <Icon name="person.crop.circle" size={30} />
                </Pressable>
              )}
            </View>
          )}
          {children}
        </ScrollView>
        {footer && (
          <View
            style={{
              paddingHorizontal: 16,
              paddingTop: 10,
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
  ...props
}: TextInputProps & { label: string }) {
  const colors = useTheme();
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
        style={[
          {
            minHeight: 48,
            borderWidth: 1,
            borderColor: colors.line,
            borderRadius: 12,
            paddingHorizontal: 12,
            paddingVertical: 10,
            fontSize: 17,
            color: colors.text,
            backgroundColor: colors.background,
          },
          style,
        ]}
      />
    </View>
  );
}
export function Toggle({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  const colors = useTheme();
  return (
    <View style={styles.row}>
      <Copy style={{ flex: 1 }}>{label}</Copy>
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
}: {
  children: ReactNode;
  error?: boolean;
}) {
  const colors = useTheme();
  return (
    <View
      style={{ padding: 14, borderRadius: 12, backgroundColor: colors.muted }}
    >
      <Copy
        accessibilityRole={error ? "alert" : undefined}
        style={{ color: error ? colors.danger : colors.warning }}
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
}: {
  title: string;
  message: string;
  icon?: SymbolViewProps["name"];
}) {
  return (
    <Panel style={{ paddingVertical: 36, alignItems: "center" }}>
      <Icon name={icon} size={40} />
      <Copy size={22} weight="600">
        {title}
      </Copy>
      <Copy muted style={{ textAlign: "center" }}>
        {message}
      </Copy>
    </Panel>
  );
}
export function Row({
  title,
  detail,
  value,
  onPress,
}: {
  title: string;
  detail?: string;
  value?: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { minHeight: 44, opacity: pressed ? 0.6 : 1 },
      ]}
    >
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
      {onPress && <Icon name="chevron.right" size={14} />}
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
        padding: 3,
      }}
    >
      {options.map((option) => (
        <Pressable
          key={option.value}
          accessibilityRole="tab"
          accessibilityState={{ selected: option.value === value }}
          onPress={() => onChange(option.value)}
          style={{
            flex: 1,
            minHeight: 44,
            justifyContent: "center",
            alignItems: "center",
            borderRadius: 10,
            padding: 6,
            backgroundColor:
              value === option.value ? colors.surface : "transparent",
          }}
        >
          <Copy size={14} weight="600">
            {option.label}
          </Copy>
        </Pressable>
      ))}
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
          style={[styles.row, { paddingHorizontal: 16, paddingVertical: 8 }]}
        >
          <Copy size={18} weight="700" style={{ flex: 1 }}>
            {title}
          </Copy>
          <IconButton name="xmark" label="Lukk" onPress={onClose} />
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
              value={option.value === value ? "✓" : undefined}
              onPress={() => {
                onChange(option.value);
                setOpen(false);
                setSearch("");
              }}
            />
          ))}
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
