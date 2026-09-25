import { useEffect } from "react";
import { useSegments } from "expo-router";
import { getCurrentScope } from "@sentry/react-native";
import { diagnosticScreen } from "@/lib/navigation-diagnostics";
import { recordEvent } from "@/lib/observability";
import { useQueryLifecycle } from "./query-lifecycle-context";

export function NavigationDiagnostics() {
  const screen = diagnosticScreen(useSegments());
  const { active, online } = useQueryLifecycle();
  useEffect(() => {
    recordEvent("application.state_changed", { active, online });
  }, [active, online]);
  useEffect(() => {
    getCurrentScope().setTag("screen", screen);
    recordEvent("navigation.opened", { screen });

    return () => {
      getCurrentScope().setTag("screen", "unknown");
    };
  }, [screen]);

  return null;
}
