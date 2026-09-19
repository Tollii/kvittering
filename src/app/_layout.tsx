import "@/lib/sentry";
import { reportError } from "@/lib/observability";
import { ReceiptMigrationError } from "@/lib/receipt-migrations";
import { useEffect } from "react";
import * as Sentry from "@sentry/react-native";
import {
  Stack,
  ThemeProvider,
  DefaultTheme,
  DarkTheme,
  type ErrorBoundaryProps,
} from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useColorScheme } from "react-native";
import { QueryLifecycleProvider } from "@/features/query-lifecycle";
import { SessionProvider } from "@/features/session";
import { useTheme } from "@/constants/theme";
import { Button, Notice, Screen } from "@/components/ui";
import { ShareIntentRoot, ShareIntentRouting } from "@/features/share-intent";

export function ErrorBoundary({ retry, error }: ErrorBoundaryProps) {
  useEffect(() => {
    reportError(error, "navigation.render");
  }, [error]);
  return (
    <SafeAreaProvider>
      <Screen title="Kunne ikke åpne siden">
        <Notice error>
          {error instanceof ReceiptMigrationError
            ? error.message
            : "Kontroller nettilkoblingen og prøv igjen."}
        </Notice>
        <Button title="Prøv igjen" onPress={retry} />
      </Screen>
    </SafeAreaProvider>
  );
}
function RootLayout() {
  const colors = useTheme();
  const scheme = useColorScheme();
  const base = scheme === "dark" ? DarkTheme : DefaultTheme;
  const navigationTheme = {
    ...base,
    colors: {
      ...base.colors,
      primary: colors.primary,
      background: colors.background,
      card: colors.background,
      text: colors.text,
      border: colors.line,
      notification: colors.primary,
    },
  };
  return (
    <ShareIntentRoot>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <ThemeProvider value={navigationTheme}>
            <StatusBar style="auto" />
            <ShareIntentRouting />
            <QueryLifecycleProvider>
              <SessionProvider>
                <Stack
                  screenOptions={{
                    headerTintColor: colors.primary,
                    headerStyle: { backgroundColor: colors.background },
                    headerTitleStyle: { color: colors.text, fontWeight: "700" },
                    contentStyle: { backgroundColor: colors.background },
                    headerShadowVisible: false,
                    headerBackButtonDisplayMode: "minimal",
                  }}
                >
                  <Stack.Screen
                    name="(tabs)"
                    options={{ headerShown: false }}
                  />
                  <Stack.Screen
                    name="receipt/[id]"
                    options={{ title: "Kvittering" }}
                  />
                  <Stack.Screen
                    name="settings"
                    options={{ title: "Husstanden", presentation: "modal" }}
                  />
                </Stack>
              </SessionProvider>
            </QueryLifecycleProvider>
          </ThemeProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ShareIntentRoot>
  );
}

export default Sentry.wrap(RootLayout);
