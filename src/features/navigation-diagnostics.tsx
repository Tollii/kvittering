import { useEffect } from "react";
import { useSegments } from "expo-router";
import { diagnosticScreen } from "@/lib/navigation-diagnostics";
import { recordEvent, recordScreen } from "@/lib/observability";
import { useQueryLifecycle } from "./query-lifecycle-context";

export function NavigationDiagnostics() {
  const screen = diagnosticScreen(useSegments());
  const { active, online } = useQueryLifecycle();
  useEffect(() => {
    recordEvent("application.state_changed", { active, online });
  }, [active, online]);
  useEffect(() => recordScreen(screen), [screen]);

  return null;
}
