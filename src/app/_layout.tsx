import {
  Stack,
  ThemeProvider,
  DefaultTheme,
  DarkTheme,
  type ErrorBoundaryProps,
} from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useColorScheme } from "react-native";
import { SessionProvider } from "@/features/session";
import { useTheme } from "@/constants/theme";
import { Button, Notice, Screen } from "@/components/ui";

export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  return (
    <SafeAreaProvider>
      <Screen title="Kunne ikke åpne siden">
        <Notice error>Kontroller nettilkoblingen og prøv igjen.</Notice>
        <Button title="Prøv igjen" onPress={retry} />
      </Screen>
    </SafeAreaProvider>
  );
}
export default function RootLayout() {
  const colors = useTheme();
  const scheme = useColorScheme();
  return (
    <SafeAreaProvider>
      <ThemeProvider value={scheme === "dark" ? DarkTheme : DefaultTheme}>
        <StatusBar style="auto" />
        <SessionProvider>
          <Stack
            screenOptions={{
              headerTintColor: colors.primary,
              headerStyle: { backgroundColor: colors.background },
              contentStyle: { backgroundColor: colors.background },
              headerShadowVisible: false,
              headerBackButtonDisplayMode: "minimal",
            }}
          >
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
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
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
