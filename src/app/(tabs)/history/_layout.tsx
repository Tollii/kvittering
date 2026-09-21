import { Stack } from "expo-router";
import { Platform } from "react-native";
import { useTheme } from "@/constants/theme";

export default function HistoryLayout() {
  const colors = useTheme();

  return (
    <Stack
      screenOptions={{
        title: "Historikk",
        headerShown: Platform.OS === "ios",
        headerStyle: { backgroundColor: colors.hero },
        headerTintColor: colors.onHero,
        headerShadowVisible: false,
      }}
    />
  );
}
