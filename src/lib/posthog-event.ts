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

/** Exception messages get the same filtering as Sentry's. */
export const redactExceptions: BeforeSend = (event) => {
  const exceptions = exceptionsSchema.safeParse(
    event.properties?.$exception_list,
  ).data;

  if (!exceptions) return event;

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
