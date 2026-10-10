import { Notice } from "@/components/ui";
import { useHousehold } from "./household-context";

/**
 * The "Uten nett" notice that every screen reading household data shows
 * first while offline. `detail` says when queued work will land, for a
 * screen whose actions wait for the network instead of failing.
 */
export function OfflineNotice({ detail }: Readonly<{ detail?: string }>) {
  const { online } = useHousehold();

  if (online) return null;

  return detail ? (
    <Notice icon="wifi.slash" title="Uten nett">
      {detail}
    </Notice>
  ) : (
    <Notice icon="wifi.slash">Uten nett</Notice>
  );
}
