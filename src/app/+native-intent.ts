import { systemPathRoute } from "@/lib/system-paths";

/** Rewrites system links that are not current routes before Expo Router reads them. */
export function redirectSystemPath({
  path,
}: {
  path: string;
  initial: boolean;
}) {
  return systemPathRoute(path);
}
