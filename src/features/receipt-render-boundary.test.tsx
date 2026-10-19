import { afterEach, expect, jest, test } from "@jest/globals";
import { render, screen, fireEvent } from "@testing-library/react-native";
import { Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as Sentry from "@sentry/react-native";
import { z } from "zod";
import { ReceiptRenderBoundary } from "./receipt-render-boundary";
import { prepareErrorEvent } from "@/lib/sentry-event";

// Use the actual React SDK boundary and event pipeline with an in-memory transport.
// oxlint-disable-next-line anti-slop/no-module-mocking -- Replace only the native SDK entry point; exercise its real React boundary and capture pipeline.
jest.mock("@sentry/react-native", () => jest.requireActual("@sentry/react"));

afterEach(async () => {
  await Sentry.close();
  jest.restoreAllMocks();
});

test("captures a render failure with its component and safe editor state, then retries", async () => {
  const events: string[] = [];
  Sentry.init({
    dsn: "https://public@example.com/1",
    sendDefaultPii: false,
    beforeSend: (event) => prepareErrorEvent(event),
    transport: () => ({
      send: async (envelope) => {
        for (const [header, payload] of envelope[1])
          if (z.object({ type: z.literal("event") }).safeParse(header).success)
            events.push(JSON.stringify(payload));

        return { statusCode: 200 };
      },
      flush: async () => true,
    }),
  });
  jest.spyOn(console, "error").mockImplementation(() => {});
  let fail = true;

  function BrokenReceiptEditor() {
    if (fail)
      throw new Error(
        'Controlled receipt render error Args: {"receipt":"PRIVATE_RECEIPT"}',
      );

    return <Text>Recovered editor</Text>;
  }

  await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, bottom: 0, left: 0, right: 0 },
      }}
    >
      <ReceiptRenderBoundary
        diagnostics={{
          incomingRevision: 3,
          remoteRevision: 4,
          baselineRevision: 4,
          dirty: true,
          operation: "saving",
        }}
      >
        <BrokenReceiptEditor />
      </ReceiptRenderBoundary>
    </SafeAreaProvider>,
  );
  await Sentry.flush();
  expect(events).toHaveLength(1);
  const serialized = events.join("\n");
  expect(serialized).toContain("BrokenReceiptEditor");
  expect(serialized).toContain('"screen":"receipt/[id]"');
  expect(serialized).toContain('"incomingRevision":3');
  expect(serialized).toContain('"remoteRevision":4');
  expect(serialized).toContain('"dirty":true');
  expect(serialized).not.toContain("PRIVATE_RECEIPT");
  expect(screen.getByText("Kunne ikke åpne kvitteringen")).toBeTruthy();
  fail = false;
  await fireEvent.press(screen.getByRole("button", { name: "Prøv igjen" }));
  expect(screen.getByText("Recovered editor")).toBeTruthy();
});
