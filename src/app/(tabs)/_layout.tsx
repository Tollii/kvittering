import { useCachedReceipts } from "@/features/receipt-cache-context";
import { useQueryLifecycle } from "@/features/query-lifecycle";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { useTheme } from "@/constants/theme";
import { useHousehold } from "@/features/household-context";

export default function TabLayout() {
  const colors = useTheme();
  const { queue } = useHousehold();
  const cache = useCachedReceipts();
  const { active, online } = useQueryLifecycle();

  const legacy = useQuery(
    api.receipts.attentionCount,
    !cache.available && active && online ? {} : "skip",
  );

  const attention = cache.available
    ? {
        count: cache.receipts.filter(
          (receipt) =>
            !receipt.excluded &&
            (receipt.status === "needs_review" || receipt.status === "failed"),
        ).length,
        capped: !cache.complete,
      }
    : legacy;

  // Badge only what needs a person; processing receipts resolve on their own.
  const pending =
    (attention?.count ?? 0) + queue.filter((entry) => entry.error).length;

  return (
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
  );
}
