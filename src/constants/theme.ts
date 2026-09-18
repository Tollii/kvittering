import { useColorScheme } from "react-native";
const light = {
  background: "#F6F5F0",
  surface: "#FFFEFA",
  text: "#243B30",
  secondary: "#66736B",
  primary: "#163F36",
  onPrimary: "#FFFFFF",
  line: "#DDDCD3",
  muted: "#E8EDE6",
  warning: "#995022",
  danger: "#B42318",
};
const dark: typeof light = {
  background: "#111B17",
  surface: "#1B2922",
  text: "#F2F3EC",
  secondary: "#A8B8AC",
  primary: "#A6D6BB",
  onPrimary: "#10291F",
  line: "#34463B",
  muted: "#293D31",
  warning: "#F0B78A",
  danger: "#FFACA5",
};
export function useTheme() {
  return useColorScheme() === "dark" ? dark : light;
}
