import { expect, it, vi } from "vitest";
import { observeForeground, removedAccount } from "../features/query-lifecycle";

// oxlint-disable-next-line anti-slop/no-module-mocking -- React Native AppState is native; the tests pass their own foreground source.
vi.mock("react-native", () => ({ AppState: {} }));

// oxlint-disable-next-line anti-slop/no-module-mocking -- Native expo-network state is not read by the lifecycle functions under test.
vi.mock("expo-network", () => ({
  useNetworkState: vi.fn<typeof import("expo-network").useNetworkState>(),
}));

it("applies initial foreground state and removes its only subscription", () => {
  const changed = vi.fn<(active: boolean) => void>();
  const unsubscribe = vi.fn<() => void>();
  let notify: (active: boolean) => void = () => {};

  const stop = observeForeground(
    {
      current: () => false,
      subscribe: (listener) => {
        notify = listener;

        return unsubscribe;
      },
    },
    changed,
  );

  expect(changed).toHaveBeenCalledExactlyOnceWith(false);
  notify(true);
  expect(changed).toHaveBeenLastCalledWith(true);
  stop();
  expect(unsubscribe).toHaveBeenCalledOnce();
});

it("evicts only at account removal, not at provider remount", () => {
  expect(removedAccount("first", "first")).toBeNull();
  expect(removedAccount(null, "first")).toBeNull();
  expect(removedAccount("first", null)).toBe("first");
  expect(removedAccount("first", "second")).toBe("first");
});
