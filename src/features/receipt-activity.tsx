import { useEffect, useState, useSyncExternalStore } from "react";
import { useConvex, useQuery, type ConvexReactClient } from "convex/react";
import { requireOptionalNativeModule } from "expo";
import { getIosPushNotificationServiceEnvironmentAsync } from "expo-application";
import Storage from "expo-sqlite/kv-store";
import { z } from "zod";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { releaseMutation } from "@/lib/releases/requests";
import { reportError } from "@/lib/observability";
import { storageSuffix } from "@/lib/deployment-storage";
import { useHousehold } from "./session";
import { Button, Notice } from "@/components/ui";

const key = "receipt-live-activity";

const bindingSchema = z.object({ scope: z.string(), activityId: z.string() });

const listeners = new Set<() => void>();

let generation = 0;

const read = () => Storage.getItemSync(key);

const subscribe = (listener: () => void) => {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
};

function saveBinding(binding: z.infer<typeof bindingSchema> | null) {
  if (binding) Storage.setItemSync(key, JSON.stringify(binding));
  else Storage.removeItemSync(key);

  for (const listener of listeners) listener();
}

function parseBinding(serialized: string | null) {
  if (!serialized) return null;

  try {
    return bindingSchema.safeParse(JSON.parse(serialized)).data ?? null;
  } catch {
    return null;
  }
}

async function factory() {
  return (await import("@/widgets/receipt-activity")).default;
}

export function clearReceiptActivity() {
  generation++;
  const revision = generation;
  saveBinding(null);

  if (!requireOptionalNativeModule("ExpoWidgets")) return;
  void factory()
    .then(async (activity) => {
      if (generation !== revision) return;
      await Promise.all(
        activity.getInstances().map((instance) => instance.end("immediate")),
      );
    })
    .catch((error) => reportError(error, "activity.clear"));
}

async function startActivity(
  client: ConvexReactClient,
  scope: string,
  receiptIds: Id<"receipts">[],
) {
  generation++;
  const revision = generation;
  const activity = await factory();

  if (generation !== revision) return;
  const previous = parseBinding(read());

  if (previous?.scope === scope)
    await releaseMutation(client, api.liveActivities.stop, {
      activityId: previous.activityId,
    });

  if (generation !== revision) return;
  await Promise.all(
    activity.getInstances().map((instance) => instance.end("immediate")),
  );

  if (generation !== revision) return;

  const instance = activity.start(
    { total: receiptIds.length, completed: 0, failed: 0, ended: false },
    "kvitto:///(tabs)/inbox",
    new Date(Date.now() + 300000),
  );

  try {
    await releaseMutation(client, api.liveActivities.register, {
      activityId: instance.getId(),
      receiptIds,
    });

    if (generation !== revision) {
      await instance.end("immediate");

      return;
    }

    saveBinding({ scope, activityId: instance.getId() });
  } catch (error) {
    await instance.end("immediate");
    throw error;
  }
}

/** The server subscription owns progress; APNs continues it while this process is suspended. */
export function ReceiptActivityTracking() {
  const client = useConvex();
  const { owner, household } = useHousehold();
  const scope = `${storageSuffix}:${owner}:${household.id}`;
  const serialized = useSyncExternalStore(subscribe, read, () => null);
  const binding = parseBinding(serialized);
  const activityId = binding?.scope === scope ? binding.activityId : undefined;

  const progress = useQuery(
    api.liveActivities.current,
    activityId ? { activityId } : "skip",
  );

  useEffect(() => {
    if (!activityId) return undefined;
    let active = true;
    let remove = () => {};

    void factory()
      .then(async (activity) => {
        const instance = activity
          .getInstances()
          .find((item) => item.getId() === activityId);

        if (!active) return;

        if (!instance) {
          saveBinding(null);
          await releaseMutation(client, api.liveActivities.stop, {
            activityId,
          });

          return;
        }

        const environment =
          await getIosPushNotificationServiceEnvironmentAsync();

        if (!active || !environment) return;

        const register = (token: string) => {
          if (active)
            void releaseMutation(client, api.liveActivities.setToken, {
              activityId,
              token,
              environment,
            }).catch((error) => reportError(error, "activity.token"));
        };

        const subscription = instance.addPushTokenListener((event) =>
          register(event.pushToken),
        );

        remove = () => subscription.remove();
        const token = await instance.getPushToken();

        if (token) register(token);
      })
      .catch((error) => reportError(error, "activity.restore"));

    return () => {
      active = false;
      remove();
    };
  }, [activityId, client]);

  useEffect(() => {
    if (!activityId || progress === undefined) return undefined;
    let active = true;
    void factory()
      .then(async (activity) => {
        if (!active || read() !== serialized) return;

        const instance = activity
          .getInstances()
          .find((item) => item.getId() === activityId);

        if (progress === null || progress.ended) {
          await instance?.end("default", progress ?? undefined);

          if (read() === serialized) saveBinding(null);
          await releaseMutation(client, api.liveActivities.stop, {
            activityId,
          });
        } else await instance?.update(progress, new Date(Date.now() + 300000));
      })
      .catch((error) => reportError(error, "activity.update"));

    return () => {
      active = false;
    };
  }, [activityId, progress, serialized, client]);

  return null;
}

export function ReceiptActivityButton({
  receiptIds,
}: Readonly<{ receiptIds: Id<"receipts">[] }>) {
  const client = useConvex();
  const { owner, household, online } = useHousehold();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (receiptIds.length < 2 || !requireOptionalNativeModule("ExpoWidgets"))
    return null;

  return (
    <>
      <Button
        title={
          receiptIds.length > 30
            ? "Følg de neste 30 på låseskjermen"
            : "Følg behandling på låseskjermen"
        }
        variant="secondary"
        busy={busy}
        disabled={!online}
        onPress={() => {
          setBusy(true);
          setError("");
          void startActivity(
            client,
            `${storageSuffix}:${owner}:${household.id}`,
            receiptIds.slice(0, 30),
          )
            .catch((cause) => {
              reportError(cause, "activity.start");
              setError(
                "Live-aktiviteten kunne ikke startes. Kontroller at Live-aktiviteter er tillatt for Kvitto i Innstillinger.",
              );
            })
            .finally(() => setBusy(false));
        }}
      />
      {!!error && <Notice tone="error">{error}</Notice>}
    </>
  );
}
