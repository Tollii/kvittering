import { expect, it, vi } from "vitest";
import { observeForeground, removedAccount } from "../features/query-lifecycle";
vi.mock("react-native", () => ({ AppState: {} }));
vi.mock("expo-network", () => ({ useNetworkState: vi.fn() }));
it("applies initial foreground state and removes its only subscription", () => {
  const changed = vi.fn();
  const unsubscribe = vi.fn();
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
  expect(changed).toHaveBeenCalledTimes(2);
  stop();
  expect(unsubscribe).toHaveBeenCalledOnce();
});
it("evicts only at account removal, not at provider remount", () => {
  expect(removedAccount("first", "first")).toBeNull();
  expect(removedAccount(null, "first")).toBeNull();
  expect(removedAccount("first", null)).toBe("first");
  expect(removedAccount("first", "second")).toBe("first");
});
