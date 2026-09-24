import { QueryLifecycleContext } from "./query-lifecycle-context";

import { useEffect, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import { useNetworkState } from "expo-network";
import { focusManager, onlineManager } from "@tanstack/react-query";

export { useQueryLifecycle } from "./query-lifecycle-context";

interface ForegroundSource {
  current(): boolean;
  subscribe(listener: (active: boolean) => void): () => void;
}

/** Installs one foreground subscription and applies its initial state. */
export function observeForeground(
  source: ForegroundSource,
  changed: (active: boolean) => void,
) {
  changed(source.current());

  return source.subscribe(changed);
}

export function QueryLifecycleProvider({
  children,
}: Readonly<{ children: ReactNode }>) {
  const [active, setActive] = useState(AppState.currentState === "active");
  const network = useNetworkState();

  const online =
    network.isConnected !== false && network.isInternetReachable !== false;

  useEffect(() => {
    onlineManager.setOnline(online);
  }, [online]);
  useEffect(
    () =>
      observeForeground(
        {
          current: () => AppState.currentState === "active",
          subscribe: (listener) => {
            const subscription = AppState.addEventListener("change", (state) =>
              listener(state === "active"),
            );

            return () => subscription.remove();
          },
        },
        (value) => {
          setActive(value);
          focusManager.setFocused(value);
        },
      ),
    [],
  );

  return (
    <QueryLifecycleContext.Provider value={{ active, online }}>
      {children}
    </QueryLifecycleContext.Provider>
  );
}

export function removedAccount(
  previous: string | null,
  current: string | null,
): string | null {
  return previous && previous !== current ? previous : null;
}
