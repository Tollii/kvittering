import { NativeTabs } from "expo-router/unstable-native-tabs";
import { useTheme } from "@/constants/theme";
import { mainTabs, useInboxBadge } from "@/features/main-tabs";

export default function TabLayout() {
  const colors = useTheme();
  const badge = useInboxBadge();

  return (
    <NativeTabs
      tintColor={colors.primary}
      backgroundColor={colors.background}
      disableTransparentOnScrollEdge
    >
      {mainTabs.map((tab) => (
        <NativeTabs.Trigger key={tab.name} name={tab.name}>
          <NativeTabs.Trigger.Label>{tab.label}</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon
            sf={
              tab.selectedIcon
                ? { default: tab.icon, selected: tab.selectedIcon }
                : tab.icon
            }
          />
          {tab.name === "inbox" && badge !== undefined && (
            <NativeTabs.Trigger.Badge>{badge}</NativeTabs.Trigger.Badge>
          )}
        </NativeTabs.Trigger>
      ))}
    </NativeTabs>
  );
}
