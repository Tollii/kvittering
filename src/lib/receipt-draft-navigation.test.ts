// @vitest-environment happy-dom
import {
  act,
  createElement,
  useSyncExternalStore,
  type SyntheticEvent,
} from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import type { AlertButton } from "react-native";
import type { usePreventRemove } from "expo-router/react-navigation";
import { useDraftNavigation } from "../features/receipt-draft-navigation";
import { createReceiptDraft } from "../features/receipt-draft";
import { ReceiptDraftController } from "./receipt-draft-controller";
import { receiptFixture } from "./testing/receipts";
import { batteryFixture } from "./domain/receipt";

type PreventCallback = Parameters<typeof usePreventRemove>[1];

type NavigationState = {
  prevented: boolean;
  callback?: PreventCallback;
  buttons: AlertButton[];
};

const navigation = vi.hoisted(() => {
  const state: NavigationState = { prevented: false, buttons: [] };

  return { state, dispatch: vi.fn<(action: { type: string }) => void>() };
});

// oxlint-disable-next-line anti-slop/no-module-mocking -- The navigator is the external interaction boundary under test.
vi.mock("expo-router/react-navigation", () => ({
  usePreventRemove: (prevented: boolean, callback: PreventCallback) => {
    navigation.state.prevented = prevented;
    navigation.state.callback = callback;
  },
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- The navigator is the external interaction boundary under test.
vi.mock("expo-router", () => ({
  useNavigation: () => ({ dispatch: navigation.dispatch }),
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- Replace the native alert surface; its user decisions are exercised below.
vi.mock("react-native", () => ({
  Alert: {
    alert: (_title: string, _message: string, buttons: AlertButton[]) => {
      navigation.state.buttons = buttons;
    },
  },
}));

afterEach(() => {
  vi.unstubAllGlobals();
  navigation.dispatch.mockClear();
  navigation.state.buttons = [];
});

function DraftFields({
  controller,
  save,
}: {
  controller: ReceiptDraftController;
  save: () => void;
}) {
  const state = useSyncExternalStore(controller.subscribe, controller.read);

  if (state.kind !== "ready") throw new Error("Draft unavailable");
  useDraftNavigation(state.draft, () =>
    controller.dispatch({ type: "discard" }),
  );

  return createElement(
    "section",
    null,
    createElement("input", {
      value: state.draft.values.data?.store,
      onInput: (event: SyntheticEvent<HTMLInputElement>) =>
        controller.dispatch({
          type: "data",
          data: {
            ...state.draft.values.data!,
            store: event.currentTarget.value,
          },
        }),
    }),
    createElement("button", { onClick: save }, "Save"),
    createElement(
      "output",
      null,
      state.draft.operation.kind === "failed"
        ? state.draft.operation.error
        : "",
    ),
  );
}

it("keeps edited fields and failure visible when Back is attempted during a pending save", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const receipt = receiptFixture({ data: batteryFixture() });

  const controller = new ReceiptDraftController(
    () => ({ restore: createReceiptDraft, write: () => {} }),
    receipt,
  );

  let rejectSave: (cause: Error) => void = (cause) => {
    throw cause;
  };

  const request = new Promise<void>((_, reject) => {
    rejectSave = reject;
  });

  let pending: Promise<void> | undefined;

  const save = () => {
    controller.dispatch({ type: "start", operation: "saving" });
    pending = request.catch((error: Error) =>
      controller.dispatch({ type: "failed", error: error.message }),
    );
  };

  const container = document.createElement("div");
  const root = createRoot(container);
  await act(async () => {
    root.render(createElement(DraftFields, { controller, save }));
  });
  await act(async () => {
    const input = container.querySelector("input")!;
    input.value = "My edited store";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    container.querySelector("button")!.click();
  });
  await act(async () => {
    if (navigation.state.prevented)
      navigation.state.callback!({ data: { action: { type: "GO_BACK" } } });
    else {
      navigation.dispatch({ type: "GO_BACK" });
      root.unmount();
    }
  });
  expect(navigation.dispatch).not.toHaveBeenCalled();
  expect(navigation.state.buttons.map((button) => button.text)).toContain(
    "Fortsett å redigere",
  );
  await act(async () => {
    rejectSave(new Error("Save failed"));
    await pending;
  });
  expect(container.querySelector("input")!.value).toBe("My edited store");
  expect(container.querySelector("output")!.textContent).toBe("Save failed");
  await act(async () => {
    navigation.state.buttons.find((button) => button.text === "Forkast")!
      .onPress!();
  });
  expect(navigation.dispatch).toHaveBeenCalledExactlyOnceWith({
    type: "GO_BACK",
  });
  expect(navigation.state.prevented).toBe(false);
  await act(async () => root.unmount());
});

it("permits navigation after the accepted save snapshot or completed deletion", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const receipt = receiptFixture({ data: batteryFixture() });

  const controller = new ReceiptDraftController(
    () => ({ restore: createReceiptDraft, write: () => {} }),
    receipt,
  );

  const container = document.createElement("div");
  const root = createRoot(container);
  await act(async () => {
    root.render(createElement(DraftFields, { controller, save: () => {} }));
  });
  await act(async () => {
    controller.dispatch({ type: "edit", values: { excluded: true } });
    controller.dispatch({ type: "start", operation: "saving" });
    controller.dispatch({ type: "saved", revision: 1, approved: false });
  });
  expect(navigation.state.prevented).toBe(true);
  await act(async () =>
    controller.dispatch({
      type: "remote",
      receipt: { ...receipt, revision: 1, excluded: true },
    }),
  );
  expect(navigation.state.prevented).toBe(false);
  await act(async () => {
    controller.dispatch({ type: "edit", values: { excluded: false } });
    controller.dispatch({ type: "deleted" });
  });
  expect(navigation.state.prevented).toBe(false);
  await act(async () => root.unmount());
});
