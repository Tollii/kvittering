import { Children, isValidElement, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  View,
  useWindowDimensions,
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
}: Readonly<{
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** `plain` is the quieter card for a group nested inside another card. */
  tone?: "surface" | "plain";
}>) {
  const colors = useTheme();

  return (
    <View
      style={[
        {
          backgroundColor:
            tone === "plain" ? colors.surfaceRaised : colors.surface,
          borderRadius: radius.card,
          borderCurve: "continuous",
          paddingVertical: 16,
          paddingHorizontal: 16,
          gap: 10,
          overflow: "hidden",
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/**
 * A card that holds a list: each child after the first gets a divider, and
 * no children means no card. Every list in the app sits in one of these, so
 * lists look the same everywhere. A fragment counts as one child, so pass
 * rows directly rather than grouped.
 */
export function List({
  children,
  style,
}: Readonly<{ children: ReactNode; style?: StyleProp<ViewStyle> }>) {
  const colors = useTheme();
  const items = Children.toArray(children).filter(isValidElement);

  if (!items.length) return null;

  return (
    <Panel style={[{ gap: 0, paddingVertical: 4 }, style]}>
      {items.map((child, index) => (
        // `toArray` gives every element a key, from its own key or its position.
        <View
          key={child.key}
          style={{
            borderTopWidth: index ? 1 : 0,
            borderTopColor: colors.line,
          }}
        >
          {child}
        </View>
      ))}
    </Panel>
  );
}

/**
 * The soft cobalt tile behind an icon: a 32-point squircle in a row, or the
 * 64-point `circle` that an empty state leads with.
 */
export function IconTile({
  icon,
  circle = false,
  color,
  children,
}: Readonly<{
  icon?: SymbolViewProps["name"];
  circle?: boolean;
  color?: string;
  /** Replaces the icon, for a spinner. */
  children?: ReactNode;
}>) {
  const colors = useTheme();
  const size = circle ? 64 : 32;

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: circle ? size / 2 : radius.tile,
        borderCurve: "continuous",
        backgroundColor: colors.primarySoft,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {children ??
        (icon && (
          <Icon
            name={icon}
            size={circle ? 28 : 16}
            weight={circle ? undefined : "semibold"}
            color={color}
          />
        ))}
    </View>
  );
}

export function SectionTitle({
  title,
  detail,
  action,
  actionLabel,
  onAction,
}: Readonly<{
  title: string;
  detail?: string;
  action?: string;
  /** Names the object when the short action text alone would not. */
  actionLabel?: string;
  onAction?: () => void;
}>) {
  const colors = useTheme();

  return (
    <View style={[styles.row, { paddingTop: 16, paddingBottom: 4 }]}>
      <View style={{ flex: 1, gap: 4 }}>
        <Copy accessibilityRole="header" role="sectionTitle">
          {title}
        </Copy>
        {!!detail && (
          <Copy role="detail" muted>
            {detail}
          </Copy>
        )}
      </View>
      {!!action && onAction && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          onPress={onAction}
          style={(state) => [
            { minHeight: 44, justifyContent: "center", paddingLeft: 12 },
            pressed(state),
          ]}
        >
          <Copy role="detail" weight="600" style={{ color: colors.primary }}>
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
}: Readonly<{
  title: string;
  value?: string;
  children: ReactNode;
  initiallyOpen?: boolean;
}>) {
  const [open, setOpen] = useState(initiallyOpen);
  const colors = useTheme();

  return (
    <Panel style={{ gap: open ? 10 : 0 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
        style={(state) => [styles.row, { minHeight: 44 }, pressed(state)]}
      >
        <Copy weight="600" style={{ flex: 1 }}>
          {title}
        </Copy>
        {!!value && (
          <Copy role="detail" muted>
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
  title,
  tone = "info",
  icon,
  onPress,
}: Readonly<{
  children: ReactNode;
  /** A bold first line above the message. */
  title?: string;
  tone?: "info" | "warning" | "error" | "success";
  icon?: SymbolViewProps["name"];
  /** Makes the notice a button with a trailing chevron. */
  onPress?: () => void;
}>) {
  const colors = useTheme();

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
  }[tone];

  const frame: ViewStyle = {
    flexDirection: "row",
    gap: 10,
    padding: 12,
    paddingLeft: 14,
    borderRadius: radius.control,
    borderCurve: "continuous",
    backgroundColor: palette.background,
    alignItems: title ? "center" : "flex-start",
  };

  const content = (
    <>
      <View style={{ paddingTop: title ? 0 : 2 }}>
        <Icon name={icon ?? palette.icon} size={16} color={palette.accent} />
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        {!!title && (
          <Copy weight="600" style={{ color: palette.text }}>
            {title}
          </Copy>
        )}
        <Copy
          role={title ? "detail" : "body"}
          muted={!!title && tone === "info"}
          accessibilityRole={tone === "error" ? "alert" : undefined}
          // An explicit `undefined` colour would override the muted colour.
          style={title && tone === "info" ? undefined : { color: palette.text }}
        >
          {children}
        </Copy>
      </View>
      {onPress && (
        <Icon name="chevron.right" size={12} color={colors.secondary} />
      )}
    </>
  );

  return onPress ? (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={(state) => [frame, pressed(state)]}
    >
      {content}
    </Pressable>
  ) : (
    <View style={frame}>{content}</View>
  );
}

export function Loading({ title = "Henter …" }: Readonly<{ title?: string }>) {
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
}: Readonly<{
  title: string;
  message?: string;
  icon?: SymbolViewProps["name"];
  children?: ReactNode;
}>) {
  return (
    <Panel style={{ paddingVertical: 32, alignItems: "center", gap: 8 }}>
      <View style={{ marginBottom: 6 }}>
        <IconTile icon={icon} circle />
      </View>
      <Copy
        accessibilityRole="header"
        role="sheetTitle"
        style={{ textAlign: "center" }}
      >
        {title}
      </Copy>
      {!!message && (
        <Copy muted style={{ textAlign: "center", maxWidth: 300 }}>
          {message}
        </Copy>
      )}
      {!!children && <View style={{ paddingTop: 8, gap: 8 }}>{children}</View>}
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
}: Readonly<{
  title: string;
  detail?: string;
  value?: string;
  icon?: SymbolViewProps["name"];
  onPress?: () => void;
  selected?: boolean;
}>) {
  const colors = useTheme();
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale > 1.3;

  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityState={onPress ? { selected } : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={(state) => [
        styles.row,
        { minHeight: 52, paddingVertical: 10 },
        pressed(state),
      ]}
    >
      {icon && <IconTile icon={icon} />}
      <View style={{ flex: 1, gap: 4 }}>
        <Copy weight="600">{title}</Copy>
        {!!detail && (
          <Copy role="detail" muted>
            {detail}
          </Copy>
        )}
        {stacked && !!value && <Copy weight="600">{value}</Copy>}
      </View>
      {!stacked && !!value && (
        <Copy
          weight="600"
          style={{ flexShrink: 1, maxWidth: "45%", textAlign: "right" }}
        >
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
