import { useState, type ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ArchMark } from "../monument-artwork";
import { useTheme } from "@/constants/theme";
import { Copy, Icon, styles, useLargeText } from "./typography";
import { Press } from "./motion";
import { FieldScrollBoundary, FieldScrollView } from "./field-scroll";
import { IconButton } from "./controls";
import { SheetPresentation } from "./sheet-presentation";

/**
 * The household and settings entry. Every tab puts it at the top right so
 * people find it in the same place; `surface` only adapts it to the backdrop.
 */
export function SettingsButton({
  surface = "hero",
}: Readonly<{ surface?: "hero" | "camera" }>) {
  const colors = useTheme();
  const camera = surface === "camera";

  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel="Husstanden og innstillinger"
      onPress={() => router.push("/settings")}
      hitSlop={6}
      style={[
        styles.iconButton,
        {
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: camera ? colors.cameraOverlay : colors.heroControl,
        },
      ]}
    >
      <Icon
        name="person.2"
        size={18}
        color={camera ? colors.onCamera : colors.onHero}
      />
    </Press>
  );
}

/**
 * The cobalt band under a screen's header that carries its key number: the
 * month total on Forbruk, the paid amount on a receipt. Pass it to `Screen`
 * as `summary`; text on it uses `onHero` and `onHeroMuted`.
 */
export function SummaryBand({
  children,
  style,
}: Readonly<{ children: ReactNode; style?: StyleProp<ViewStyle> }>) {
  const colors = useTheme();

  return (
    <View
      style={[
        {
          backgroundColor: colors.hero,
          paddingHorizontal: 20,
          paddingTop: 12,
          paddingBottom: 20,
          gap: 8,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Screen({
  children,
  title,
  subtitle,
  settings = false,
  insetTop = true,
  footer,
  summary,
  statusBarStyle,
  scrollable = true,
}: Readonly<{
  children: ReactNode;
  title?: string;
  subtitle?: string;
  settings?: boolean;
  insetTop?: boolean;
  footer?: ReactNode;
  summary?: ReactNode;
  statusBarStyle?: "auto" | "light" | "dark";
  scrollable?: boolean;
}>) {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  // At large text a pinned footer would cover most of the screen, so it
  // scrolls in after the content instead.
  const inlineFooter = useLargeText() && scrollable && !!footer;

  const header = !!title && (
    <View
      style={[
        styles.row,
        {
          backgroundColor: colors.hero,
          paddingHorizontal: 20,
          paddingVertical: 14,
        },
      ]}
    >
      <ArchMark color={colors.onHero} />
      <View style={{ flex: 1, gap: 2 }}>
        <Copy
          accessibilityRole="header"
          role="screenTitle"
          style={{ color: colors.onHero }}
        >
          {title}
        </Copy>
        {!!subtitle && (
          <Copy
            role="detail"
            weight="500"
            style={{ color: colors.onHeroMuted }}
          >
            {subtitle}
          </Copy>
        )}
      </View>
      {settings && <SettingsButton />}
    </View>
  );

  const content = (
    <View
      style={{
        maxWidth: 760,
        width: "100%",
        alignSelf: "center",
        flexGrow: 1,
        flex: scrollable ? undefined : 1,
      }}
    >
      {header}
      {summary}
      <View
        style={{
          paddingHorizontal: 20,
          paddingTop: title || summary ? 12 : 16,
          paddingBottom: footer && !inlineFooter ? 16 : 32,
          gap: 16,
          flexGrow: 1,
          flex: scrollable ? undefined : 1,
        }}
      >
        {children}
        {inlineFooter && (
          <View style={{ gap: 8, paddingTop: 8 }}>{footer}</View>
        )}
      </View>
    </View>
  );

  return (
    <SafeAreaView
      edges={insetTop ? ["top", "left", "right"] : ["left", "right"]}
      style={{
        flex: 1,
        backgroundColor: title ? colors.hero : colors.background,
      }}
    >
      {statusBarStyle && <StatusBar style={statusBarStyle} />}
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1, backgroundColor: colors.background }}
      >
        {scrollable ? (
          <FieldScrollView
            style={{ flex: 1 }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            contentInsetAdjustmentBehavior="automatic"
            contentContainerStyle={{ flexGrow: 1 }}
          >
            {content}
          </FieldScrollView>
        ) : (
          content
        )}
        {!!footer && !inlineFooter && (
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

export function Sheet({
  visible,
  onClose,
  dismissible = true,
  scrollable = true,
  ...content
}: SheetContent &
  Readonly<{
    visible: boolean;
    dismissible?: boolean;
    scrollable?: boolean;
    onClose: () => void;
  }>) {
  const colors = useTheme();

  // Callers often clear what a sheet shows in the same update that closes it,
  // so a closing sheet holds its last content, untouchable, until it is gone.
  const [held, setHeld] = useState<SheetContent | null>(null);

  if (visible && (held === null || !sameContent(held, content)))
    setHeld(content);

  const closing = !visible && held !== null;
  const { title, header, footer, children } = closing ? held : content;
  // At large text a fixed header or footer would leave the content a sliver,
  // so both scroll with it, as a screen's footer does.
  const inline = useLargeText() && scrollable;
  const inlineHeader = inline && !!header;
  const inlineFooter = inline && !!footer;

  return (
    <SheetPresentation
      visible={visible}
      onClose={onClose}
      onDismissed={() => setHeld(null)}
      dismissible={dismissible}
    >
      <FieldScrollBoundary>
        <SafeAreaView
          pointerEvents={closing ? "none" : "auto"}
          style={{ flex: 1, backgroundColor: colors.background }}
        >
          <View
            style={[
              styles.row,
              { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
            ]}
          >
            <Copy
              accessibilityRole="header"
              role="sheetTitle"
              style={{ flex: 1 }}
            >
              {title}
            </Copy>
            <IconButton
              name="xmark"
              label="Lukk"
              size={15}
              filled
              disabled={!dismissible}
              color={colors.text}
              onPress={onClose}
            />
          </View>
          {!!header && !inlineHeader && (
            <View style={{ paddingHorizontal: 16, paddingBottom: 10, gap: 10 }}>
              {header}
            </View>
          )}
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
          >
            {scrollable ? (
              <FieldScrollView
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="interactive"
                contentContainerStyle={{
                  padding: 16,
                  paddingTop: 4,
                  gap: 16,
                  paddingBottom: 24,
                }}
              >
                {inlineHeader && <View style={{ gap: 10 }}>{header}</View>}
                {children}
                {inlineFooter && <View style={{ gap: 8 }}>{footer}</View>}
              </FieldScrollView>
            ) : (
              children
            )}
            {!!footer && !inlineFooter && (
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
      </FieldScrollBoundary>
    </SheetPresentation>
  );
}

type SheetContent = Readonly<{
  title: string;
  children: ReactNode;
  header?: ReactNode;
  footer?: ReactNode;
}>;

function sameContent(a: SheetContent, b: SheetContent) {
  return (
    a.title === b.title &&
    a.children === b.children &&
    a.header === b.header &&
    a.footer === b.footer
  );
}
