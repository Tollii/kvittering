import { type ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ArchMark } from "../monument-artwork";
import { useTheme } from "@/constants/theme";
import { Copy, Icon, pressed, styles } from "./typography";
import { IconButton } from "./controls";

export function Screen({
  children,
  title,
  subtitle,
  settings = false,
  insetTop = true,
  footer,
  headerRight,
  statusBarStyle,
}: Readonly<{
  children: ReactNode;
  title?: string;
  subtitle?: string;
  settings?: boolean;
  insetTop?: boolean;
  footer?: ReactNode;
  headerRight?: ReactNode;
  statusBarStyle?: "auto" | "light" | "dark";
}>) {
  const colors = useTheme();
  const insets = useSafeAreaInsets();

  const header = !!title && (
    <View
      style={[
        styles.row,
        {
          backgroundColor: colors.hero,
          marginHorizontal: -20,
          paddingHorizontal: 20,
          paddingVertical: 14,
        },
      ]}
    >
      <ArchMark color={colors.onHero} />
      <View style={{ flex: 1, gap: 2 }}>
        <Copy
          accessibilityRole="header"
          size={24}
          weight="600"
          style={{ color: colors.onHero }}
        >
          {title}
        </Copy>
        {!!subtitle && (
          <Copy size={14} weight="500" style={{ color: colors.onHeroMuted }}>
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
              backgroundColor: "#FFFFFF22",
              borderRadius: 20,
              minWidth: 44,
              minHeight: 44,
            },
            pressed(state),
          ]}
        >
          <Icon name="person.2" size={18} color={colors.onHero} />
        </Pressable>
      )}
    </View>
  );

  const content = (
    <View
      style={{
        paddingHorizontal: 20,
        paddingTop: title ? 0 : 16,
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

export function Sheet({
  title,
  visible,
  onClose,
  children,
  header,
  footer,
}: Readonly<{
  title: string;
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  header?: ReactNode;
  footer?: ReactNode;
}>) {
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
