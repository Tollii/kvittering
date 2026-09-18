import { NativeTabs } from "expo-router/unstable-native-tabs";
import { useTheme } from "@/constants/theme";
import { useHousehold } from "@/features/session";
import { NotificationRouting } from "@/features/notifications";
export default function TabLayout() {
  const colors = useTheme();
  const { receipts, queue } = useHousehold();
  const pending =
    receipts.filter(
      (receipt) => receipt.status !== "reviewed" && !receipt.excluded,
    ).length + queue.length;
  return (
    <>
      <NotificationRouting />
      <NativeTabs
        tintColor={colors.primary}
        backgroundColor={colors.background}
        disableTransparentOnScrollEdge
      >
        <NativeTabs.Trigger name="index">
          <NativeTabs.Trigger.Label>Kamera</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon
            sf={{ default: "camera", selected: "camera.fill" }}
          />
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="inbox">
          <NativeTabs.Trigger.Label>Innboks</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon
            sf={{ default: "tray", selected: "tray.fill" }}
          />
          {pending > 0 && (
            <NativeTabs.Trigger.Badge>
              {String(pending)}
            </NativeTabs.Trigger.Badge>
          )}
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="spending">
          <NativeTabs.Trigger.Label>Forbruk</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf="chart.bar.xaxis" />
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="history">
          <NativeTabs.Trigger.Label>Historikk</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf="magnifyingglass" />
        </NativeTabs.Trigger>
      </NativeTabs>
    </>
  );
}
