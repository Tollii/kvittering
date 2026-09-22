import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { useTheme } from "@/constants/theme";
import { useHousehold } from "@/features/session";

export default function TabLayout() {
  const colors = useTheme();
  const { queue } = useHousehold();
  const attention = useQuery(api.receipts.attentionCount);

  // Badge only what needs a person; processing receipts resolve on their own.
  const pending =
    (attention?.count ?? 0) + queue.filter((entry) => entry.error).length;

  return (
    <>
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
              {attention?.capped ? `${pending}+` : String(pending)}
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
