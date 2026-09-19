import { useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { type SymbolViewProps } from "expo-symbols";
import { radius, useTheme } from "@/constants/theme";
import { Copy, Icon, pressed, styles } from "./typography";

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
