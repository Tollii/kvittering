import type { Receipt } from "@/lib/domain/insights";
import type { ReceiptData } from "@/lib/domain/receipt";
import type { ProductChoice } from "@/lib/domain/product-reference";

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

/** A save was sent and its result is not yet reflected in the snapshot. */
function isSaveInFlight(operation: Operation): boolean {
  return operation.kind === "saving" || operation.kind === "awaiting-snapshot";
}

/** A save, delete, or other request to the server has not returned. */
function isRequestRunning(operation: Operation): boolean {
  return (
    operation.kind === "saving" ||
    operation.kind === "deleting" ||
    operation.kind === "working"
  );
}

/** The editor accepts no new action until the current one settles. */
export function isDraftBusy(draft: ReceiptDraft): boolean {
  return (
    isRequestRunning(draft.operation) ||
    draft.operation.kind === "awaiting-snapshot"
  );
}

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

/** Records an edit and keeps a save in flight until its result arrives. */
function applyEdit(
  state: ReceiptDraft,
  values: Partial<ReceiptDraftValues>,
): ReceiptDraft {
  return {
    ...state,
    values: { ...state.values, ...values },
    dirty: true,
    editVersion: state.editVersion + 1,
    operation: isSaveInFlight(state.operation)
      ? state.operation
      : { kind: "idle" },
  };
}

/** A new store or branch clears the physical store chosen for the old one. */
function applyData(state: ReceiptDraft, data: ReceiptData): ReceiptDraft {
  const storeChanged =
    state.values.data &&
    (data.store !== state.values.data.store ||
      data.branch !== state.values.data.branch);

  return applyEdit(
    state,
    storeChanged
      ? {
          data: { ...data, physicalStore: null, physicalStoreManual: false },
          physicalStoreId: undefined,
        }
      : { data },
  );
}

function removeLine(state: ReceiptDraft, lineId: string): ReceiptDraft {
  const productChanges = { ...state.values.productChanges };
  const moneyErrors = { ...state.moneyErrors };
  delete productChanges[lineId];
  delete moneyErrors[lineId];

  return {
    ...applyEdit(state, {
      data: state.values.data
        ? {
            ...state.values.data,
            lines: state.values.data.lines.filter((line) => line.id !== lineId),
          }
        : null,
      productChanges,
      remember: state.values.remember.filter((id) => id !== lineId),
    }),
    moneyErrors,
  };
}

function setMoneyError(
  state: ReceiptDraft,
  key: string,
  error: string | null,
): ReceiptDraft {
  const moneyErrors = { ...state.moneyErrors };

  if (error) moneyErrors[key] = error;
  else delete moneyErrors[key];

  return { ...applyEdit(state, {}), moneyErrors };
}

/** A newer snapshot replaces the draft only when no local edit or request depends on the old one. */
function receiveRemote(state: ReceiptDraft, receipt: Receipt): ReceiptDraft {
  if (receipt.revision < state.remote.revision) return state;
  const next = { ...state, remote: receipt };

  if (state.operation.kind === "awaiting-snapshot")
    return acceptSavedSnapshot(next);

  if (state.dirty || isRequestRunning(state.operation)) return next;

  return {
    ...createReceiptDraft(receipt),
    generation: state.generation + 1,
  };
}

function receiveSaved(
  state: ReceiptDraft,
  revision: number,
  approved: boolean,
): ReceiptDraft {
  if (state.operation.kind !== "saving") return state;

  return acceptSavedSnapshot({
    ...state,
    operation: {
      kind: "awaiting-snapshot",
      revision,
      approved,
      editVersion: state.operation.editVersion,
    },
  });
}

/** Pure edit transitions. The controller supplies all I/O results. */
export function reduceReceiptDraft(
  state: ReceiptDraft,
  action: ReceiptDraftAction,
): ReceiptDraft {
  switch (action.type) {
    case "edit":
      return applyEdit(state, action.values);
    case "data":
      return applyData(state, action.data);
    case "remember":
      return applyEdit(state, {
        remember: action.value
          ? [...new Set([...state.values.remember, ...action.ids])]
          : state.values.remember.filter((id) => !action.ids.includes(id)),
      });
    case "product":
      return applyEdit(state, {
        productChanges: {
          ...state.values.productChanges,
          [action.lineId]: action.choice,
        },
      });
    case "remove-line":
      return removeLine(state, action.lineId);
    case "money-error":
      return setMoneyError(state, action.key, action.error);
    case "remote":
      return receiveRemote(state, action.receipt);
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
    case "saved":
      return receiveSaved(state, action.revision, action.approved);
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
