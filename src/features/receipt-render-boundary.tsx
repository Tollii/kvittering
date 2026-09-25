import { useEffect, type ReactNode } from "react";
import { ErrorBoundary } from "@sentry/react-native";
import { Button, Notice, Screen } from "@/components/ui";
import type { receiptDraftDiagnostics } from "@/lib/receipt-diagnostics";
import { diagnosticText } from "@/lib/sentry-event";
import { recordEvent } from "@/lib/observability";

/** Catch below Expo Router so React supplies the component stack before it is lost. */
export function ReceiptRenderBoundary({
  children,
  diagnostics,
}: Readonly<{
  children: ReactNode;
  diagnostics?: ReturnType<typeof receiptDraftDiagnostics>;
}>) {
  const {
    incomingRevision,
    remoteRevision,
    baselineRevision,
    dirty,
    operation,
  } = diagnostics ?? {};

  useEffect(() => {
    if (operation)
      recordEvent("receipt.editor_state", {
        incomingRevision,
        remoteRevision,
        baselineRevision,
        dirty,
        operation,
      });
  }, [incomingRevision, remoteRevision, baselineRevision, dirty, operation]);

  return (
    <ErrorBoundary
      beforeCapture={(scope, _error, componentStack) => {
        scope.setTag("operation", "receipt.render");
        scope.setTag("screen", "receipt/[id]");
        scope.setContext("receiptEditor", diagnostics ?? null);
        scope.setContext("react", {
          componentStack: diagnosticText(componentStack),
        });
      }}
      fallback={({ resetError }) => (
        <Screen title="Kunne ikke åpne kvitteringen" insetTop={false}>
          <Notice tone="error">Prøv å åpne kvitteringen igjen.</Notice>
          <Button title="Prøv igjen" onPress={resetError} />
        </Screen>
      )}
    >
      {children}
    </ErrorBoundary>
  );
}
