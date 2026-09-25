import { afterEach, expect, jest, test } from "@jest/globals";
import { useSyncExternalStore } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Alert, Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import type { usePreventRemove } from "expo-router/react-navigation";
import { ReceiptDraftBoundary } from "./receipt-draft-boundary";
import { ReceiptDraftController } from "@/lib/receipt-draft-controller";
import { createReceiptDraft } from "@/lib/receipt-draft";
import { receiptFixture } from "@/lib/testing/receipts";

type PreventCallback = Parameters<typeof usePreventRemove>[1];

type NavigationState = {
  prevented: boolean;
  callback?: PreventCallback;
  dispatch: ReturnType<typeof jest.fn>;
};

const mockNavigation: NavigationState = {
  prevented: false,
  dispatch: jest.fn(),
};

// oxlint-disable-next-line anti-slop/no-module-mocking -- Use the real React error boundary without native transport.
jest.mock("@sentry/react-native", () => jest.requireActual("@sentry/react"));

// oxlint-disable-next-line anti-slop/no-module-mocking -- The navigator is the external interaction boundary; registration must follow component lifetime.
jest.mock("expo-router/react-navigation", () => ({
  usePreventRemove: (prevented: boolean, callback: PreventCallback) => {
    const { useEffect } = jest.requireActual<typeof import("react")>("react");
    useEffect(() => {
      mockNavigation.prevented = prevented;
      mockNavigation.callback = callback;

      return () => {
        mockNavigation.prevented = false;
        mockNavigation.callback = undefined;
      };
    }, [prevented, callback]);
  },
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- Replace only the native navigation operation, keeping the screen components.
jest.mock("expo-router", () => ({
  ...jest.requireActual<typeof import("expo-router")>("expo-router"),
  useNavigation: () => ({ dispatch: mockNavigation.dispatch }),
}));

afterEach(() => {
  jest.restoreAllMocks();
  mockNavigation.dispatch.mockClear();
});

test("protects an in-memory draft after an editor failure until the user discards it", async () => {
  jest.spyOn(console, "error").mockImplementation(() => {});

  const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});

  const controller = new ReceiptDraftController(
    () => ({
      restore: createReceiptDraft,
      write: () => {
        throw new Error("Storage unavailable");
      },
    }),
    receiptFixture(),
  );

  let fail = true;

  function Editor({ dirty }: Readonly<{ dirty: boolean }>) {
    if (dirty && fail) throw new Error("Controlled editor failure");

    return <Text>{dirty ? "Unsaved editor" : "Unchanged editor"}</Text>;
  }

  function Session() {
    const snapshot = useSyncExternalStore(
      controller.subscribe,
      controller.read,
    );

    if (snapshot.kind !== "ready") throw new Error("Draft unavailable");

    return (
      <ReceiptDraftBoundary
        draft={snapshot.draft}
        dispatch={controller.dispatch}
        incomingRevision={0}
      >
        <Editor dirty={snapshot.draft.dirty} />
      </ReceiptDraftBoundary>
    );
  }

  await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, bottom: 0, left: 0, right: 0 },
      }}
    >
      <Session />
    </SafeAreaProvider>,
  );
  await act(() =>
    controller.dispatch({ type: "edit", values: { excluded: true } }),
  );
  expect(controller.read()).toMatchObject({
    kind: "ready",
    draft: { dirty: true, values: { excluded: true } },
    storageError: expect.stringContaining("kunne ikke lagres"),
  });
  expect(screen.getByText("Kunne ikke åpne kvitteringen")).toBeTruthy();
  expect(mockNavigation.prevented).toBe(true);
  await act(() =>
    mockNavigation.callback!({ data: { action: { type: "GO_BACK" } } }),
  );
  expect(mockNavigation.dispatch).not.toHaveBeenCalled();
  expect(alert.mock.calls[0]?.[2]?.map((button) => button.text)).toContain(
    "Fortsett å redigere",
  );

  fail = false;
  await fireEvent.press(screen.getByRole("button", { name: "Prøv igjen" }));
  expect(screen.getByText("Unsaved editor")).toBeTruthy();
  expect(mockNavigation.prevented).toBe(true);
  await act(() =>
    alert.mock.calls[0]?.[2]
      ?.find((button) => button.text === "Forkast")
      ?.onPress?.(),
  );
  expect(mockNavigation.dispatch).toHaveBeenCalledWith({ type: "GO_BACK" });
  expect(mockNavigation.prevented).toBe(false);
  expect(screen.getByText("Unchanged editor")).toBeTruthy();
});
