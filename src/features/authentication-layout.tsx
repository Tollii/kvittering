import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Copy, Icon, faded, Press } from "@/components/ui";
import { ArchMark } from "@/components/monument-artwork";
import { radius, useTheme } from "@/constants/theme";

export function AuthenticationLayout({
  children,
  title,
  subtitle,
  compact,
  navigation,
}: Readonly<{
  children: ReactNode;
  title: string;
  subtitle: string;
  compact: boolean;
  navigation?: ReactNode;
}>) {
  const colors = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1, backgroundColor: colors.background }}
    >
      <StatusBar style="auto" />
      <ScrollView
        contentInsetAdjustmentBehavior="never"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        contentContainerStyle={{
          flexGrow: 1,
          paddingTop: insets.top + 12,
          paddingBottom: Math.max(insets.bottom, 24),
          paddingLeft: Math.max(insets.left, 28),
          paddingRight: Math.max(insets.right, 28),
        }}
      >
        <View
          style={{
            flexGrow: 1,
            width: "100%",
            maxWidth: 420,
            alignSelf: "center",
            gap: 24,
          }}
        >
          {navigation}
          <View
            style={{
              flexGrow: compact ? 0 : 1,
              justifyContent: "center",
              alignItems: "center",
              gap: 20,
              paddingVertical: compact ? 16 : 48,
            }}
          >
            <View
              accessible={false}
              style={{
                width: compact ? 64 : 88,
                height: compact ? 64 : 88,
                borderRadius: radius.card,
                borderCurve: "continuous",
                backgroundColor: colors.hero,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <View style={{ transform: [{ scale: compact ? 1.3 : 1.8 }] }}>
                <ArchMark color={colors.onHero} />
              </View>
            </View>
            <View style={{ gap: 10, alignItems: "center" }}>
              <Copy
                accessibilityRole="header"
                size={32}
                weight="700"
                style={{ textAlign: "center" }}
              >
                {title}
              </Copy>
              <Copy muted size={17} style={{ textAlign: "center" }}>
                {subtitle}
              </Copy>
            </View>
          </View>
          {children}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function AuthenticationLink({
  title,
  onPress,
  disabled,
  back = false,
}: Readonly<{
  title: string;
  onPress: () => void;
  disabled: boolean;
  back?: boolean;
}>) {
  const colors = useTheme();

  return (
    <Press
      feedback="highlight"
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        {
          minHeight: 44,
          paddingVertical: 10,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: back ? "flex-start" : "center",
          gap: 6,
        },
        faded(disabled),
      ]}
    >
      {back && <Icon name="chevron.left" size={16} color={colors.primary} />}
      <Copy
        size={16}
        weight="500"
        style={{ color: colors.primary, flexShrink: 1 }}
      >
        {title}
      </Copy>
    </Press>
  );
}
