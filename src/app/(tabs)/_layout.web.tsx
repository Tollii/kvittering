// Browser checks of the iOS app: a JavaScript tab bar drawn like the iOS
// floating tab bar, because native tabs render as a top tab list on web.
import { Tabs } from "expo-router";
import { type BottomTabBarProps } from "expo-router/js-tabs";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Copy, Icon } from "@/components/ui";
import { useTheme } from "@/constants/theme";
import { mainTabs, useInboxBadge } from "@/features/main-tabs";

const barHeight = 62;

function barBottom(inset: number) {
  return inset > 0 ? inset - 12 : 12;
}

function TabBar({ state, navigation }: Readonly<BottomTabBarProps>) {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const badge = useInboxBadge();

  // Over the camera the iOS bar is glass on the dark viewfinder.
  const camera = state.routes[state.index]?.name === "index";

  return (
    <View
      accessibilityRole="tablist"
      style={{
        position: "absolute",
        zIndex: 1,
        left: 20,
        right: 20,
        bottom: barBottom(insets.bottom),
        height: barHeight,
        flexDirection: "row",
        padding: 4,
        borderRadius: barHeight / 2,
        backgroundColor: camera ? colors.heroTrack : colors.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: camera ? colors.heroControl : colors.line,
        boxShadow: `0 8px 24px ${colors.shadow}`,
      }}
    >
      {state.routes.map((route, index) => {
        const tab = mainTabs.find((candidate) => candidate.name === route.name);

        if (!tab) return null;

        const selected = state.index === index;

        const color = camera
          ? colors.onCamera
          : selected
            ? colors.primary
            : colors.text;

        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => {
              const event = navigation.emit({
                type: "tabPress",
                target: route.key,
                canPreventDefault: true,
              });

              if (!selected && !event.defaultPrevented)
                navigation.navigate(route.name);
            }}
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              gap: 2,
              borderRadius: (barHeight - 8) / 2,
              backgroundColor: selected
                ? camera
                  ? colors.heroTrack
                  : colors.muted
                : "transparent",
            }}
          >
            <Icon
              name={(selected && tab.selectedIcon) || tab.icon}
              size={24}
              color={color}
            />
            <Copy size={10} weight="600" style={{ color, lineHeight: 12 }}>
              {tab.label}
            </Copy>
            {tab.name === "inbox" && badge !== undefined && (
              <View
                style={{
                  position: "absolute",
                  top: 4,
                  left: "56%",
                  minWidth: 18,
                  height: 18,
                  borderRadius: 9,
                  paddingHorizontal: 5,
                  justifyContent: "center",
                  backgroundColor: colors.danger,
                }}
              >
                <Copy
                  size={11}
                  weight="700"
                  style={{
                    color: colors.surface,
                    lineHeight: 13,
                    textAlign: "center",
                  }}
                >
                  {badge}
                </Copy>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

export default function TabLayout() {
  const colors = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      // A top position puts the bar first in the page, so browser flows that
      // tap "Innboks" find the tab before a screen title with the same text.
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={({ navigation, route }) => ({
        headerShown: false,
        tabBarPosition: "top",
        sceneStyle: {
          paddingBottom: barHeight + barBottom(insets.bottom),
          backgroundColor:
            route.name === "index"
              ? colors.cameraBackground
              : colors.background,
          // Without native screens, other tabs stay laid out behind this one.
          display: navigation.isFocused() ? "flex" : "none",
        },
      })}
    >
      {mainTabs.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{ title: tab.label }}
        />
      ))}
    </Tabs>
  );
}
