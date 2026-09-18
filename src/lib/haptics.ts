import { Platform } from "react-native";
import * as Haptics from "expo-haptics";

/** Light tap for a confirmed decision; success for a completed receipt. Silent on web. */
export function tapFeedback() {
  if (Platform.OS === "web") return;
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}
export function successFeedback() {
  if (Platform.OS === "web") return;
  void Haptics.notificationAsync(
    Haptics.NotificationFeedbackType.Success,
  ).catch(() => {});
}
export function errorFeedback() {
  if (Platform.OS === "web") return;
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(
    () => {},
  );
}
