import { z } from "zod";
import type { PostHogOptions } from "posthog-react-native";
import { diagnosticText } from "./sentry-event";

const exceptionsSchema = z.array(
  z.object({ value: z.string().optional() }).catchall(z.json()),
);

type BeforeSend = Exclude<
  NonNullable<PostHogOptions["before_send"]>,
  unknown[]
>;

/**
 * Exception messages get the same filtering as Sentry's. An exception list
 * that cannot be read is dropped rather than sent unfiltered.
 */
export const redactExceptions: BeforeSend = (event) => {
  const list = event.properties?.$exception_list;

  if (list === undefined) return event;

  // Read as it will be sent: JSON drops the undefined fields that unmapped
  // stack frames carry, which z.json() would otherwise reject.
  const exceptions = exceptionsSchema.safeParse(
    JSON.parse(JSON.stringify(list)),
  ).data;

  if (!exceptions) return null;

  return {
    ...event,
    properties: {
      ...event.properties,
      $exception_list: exceptions.map((exception) =>
        exception.value
          ? { ...exception, value: diagnosticText(exception.value) }
          : exception,
      ),
    },
  };
};
