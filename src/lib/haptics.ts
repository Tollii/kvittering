import * as Haptics from "expo-haptics";

/** Light tap for a confirmed decision; success for a completed receipt. */
export function tapFeedback() {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

export function successFeedback() {
  void Haptics.notificationAsync(
    Haptics.NotificationFeedbackType.Success,
  ).catch(() => {});
}

export function errorFeedback() {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(
    () => {},
  );
}
