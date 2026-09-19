import type { Receipt } from "@/lib/domain/insights";
import type { ReceiptData } from "@/lib/domain/receipt";
import type { ProductChoice } from "./receipt-line-editor";

export type ReceiptDraftValues = {
  data: ReceiptData | null;
  duplicateResolved: boolean;
  excluded: boolean;
  remember: string[];
  productChanges: Record<string, ProductChoice>;
  physicalStoreId: number | null | undefined;
};

type Operation =
  | { kind: "idle" }
  | { kind: "saving"; editVersion: number }
  | {
      kind: "awaiting-snapshot";
      revision: number;
      editVersion: number;
      approved: boolean;
    }
  | { kind: "saved"; approved: boolean }
  | { kind: "working" | "deleting" | "deleted" }
  | { kind: "failed"; error: string };

export type ReceiptDraft = {
  baseline: Receipt;
  remote: Receipt;
  values: ReceiptDraftValues;
  moneyErrors: Record<string, string>;
  dirty: boolean;
  editVersion: number;
  generation: number;
  operation: Operation;
};

export type ReceiptDraftAction =
  | { type: "edit"; values: Partial<ReceiptDraftValues> }
  | { type: "data"; data: ReceiptData }
  | { type: "remember"; ids: string[]; value: boolean }
  | { type: "product"; lineId: string; choice: ProductChoice }
  | { type: "remove-line"; lineId: string }
  | { type: "money-error"; key: string; error: string | null }
  | { type: "remote"; receipt: Receipt }
  | { type: "discard" }
  | { type: "start"; operation: "saving" | "deleting" | "working" }
  | { type: "saved"; revision: number; approved: boolean }
  | { type: "failed"; error: string }
  | { type: "finished" | "deleted" };

export function createReceiptDraft(receipt: Receipt): ReceiptDraft {
  return {
    baseline: receipt,
    remote: receipt,
    values: {
      data: receipt.data,
      duplicateResolved: receipt.duplicateResolved,
      excluded: receipt.excluded,
      remember: [],
      productChanges: {},
      physicalStoreId: undefined,
    },
    moneyErrors: {},
    dirty: false,
    editVersion: 0,
    generation: 0,
    operation: { kind: "idle" },
  };
}

function acceptSavedSnapshot(state: ReceiptDraft): ReceiptDraft {
  const operation = state.operation;

  if (
    operation.kind !== "awaiting-snapshot" ||
    state.remote.revision < operation.revision
  )
    return state;
  const laterEdits = state.editVersion !== operation.editVersion;

  return {
    ...(laterEdits ? state : createReceiptDraft(state.remote)),
    baseline: state.remote,
    generation: laterEdits ? state.generation : state.generation + 1,
    editVersion: state.editVersion,
    operation: laterEdits
      ? { kind: "idle" }
      : { kind: "saved", approved: operation.approved },
  };
}

/** Pure edit transitions. The controller supplies all I/O results. */
export function reduceReceiptDraft(
  state: ReceiptDraft,
  action: ReceiptDraftAction,
): ReceiptDraft {
  const edit = (values: Partial<ReceiptDraftValues>): ReceiptDraft => ({
    ...state,
    values: { ...state.values, ...values },
    dirty: true,
    editVersion: state.editVersion + 1,
    operation: ["saving", "awaiting-snapshot"].includes(state.operation.kind)
      ? state.operation
      : { kind: "idle" },
  });

  switch (action.type) {
    case "edit":
      return edit(action.values);
    case "data": {
      const storeChanged =
        state.values.data &&
        (action.data.store !== state.values.data.store ||
          action.data.branch !== state.values.data.branch);

      return edit(
        storeChanged
          ? {
              data: {
                ...action.data,
                physicalStore: null,
                physicalStoreManual: false,
              },
              physicalStoreId: undefined,
            }
          : { data: action.data },
      );
    }

    case "remember":
      return edit({
        remember: action.value
          ? [...new Set([...state.values.remember, ...action.ids])]
          : state.values.remember.filter((id) => !action.ids.includes(id)),
      });
    case "product":
      return edit({
        productChanges: {
          ...state.values.productChanges,
          [action.lineId]: action.choice,
        },
      });
    case "remove-line": {
      const productChanges = { ...state.values.productChanges };
      const moneyErrors = { ...state.moneyErrors };
      delete productChanges[action.lineId];
      delete moneyErrors[action.lineId];

      return {
        ...edit({
          data: state.values.data
            ? {
                ...state.values.data,
                lines: state.values.data.lines.filter(
                  (line) => line.id !== action.lineId,
                ),
              }
            : null,
          productChanges,
          remember: state.values.remember.filter((id) => id !== action.lineId),
        }),
        moneyErrors,
      };
    }

    case "money-error": {
      const moneyErrors = { ...state.moneyErrors };

      if (action.error) moneyErrors[action.key] = action.error;
      else delete moneyErrors[action.key];

      return { ...edit({}), moneyErrors };
    }

    case "remote": {
      if (action.receipt.revision < state.remote.revision) return state;
      const next = { ...state, remote: action.receipt };

      if (state.operation.kind === "awaiting-snapshot")
        return acceptSavedSnapshot(next);

      if (
        state.dirty ||
        ["saving", "deleting", "working"].includes(state.operation.kind)
      )
        return next;

      return {
        ...createReceiptDraft(action.receipt),
        generation: state.generation + 1,
      };
    }

    case "discard":
      return {
        ...createReceiptDraft(state.remote),
        generation: state.generation + 1,
      };
    case "start":
      return {
        ...state,
        operation:
          action.operation === "saving"
            ? { kind: "saving", editVersion: state.editVersion }
            : { kind: action.operation },
      };
    case "saved": {
      if (state.operation.kind !== "saving") return state;

      return acceptSavedSnapshot({
        ...state,
        operation: {
          kind: "awaiting-snapshot",
          revision: action.revision,
          approved: action.approved,
          editVersion: state.operation.editVersion,
        },
      });
    }

    case "failed":
      return { ...state, operation: { kind: "failed", error: action.error } };
    case "finished":
      return state.operation.kind === "working"
        ? { ...state, operation: { kind: "idle" } }
        : state;
    case "deleted":
      return { ...state, dirty: false, operation: { kind: "deleted" } };
  }
}
