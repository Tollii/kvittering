import type { ReactNode } from "react";
import { useEffect } from "react";
import { router } from "expo-router";
import { ShareIntentProvider, useShareIntentContext } from "expo-share-intent";
import { offerImportedFiles } from "@/lib/pending-import";

/** Hands images and PDFs from the iOS share sheet to the capture screen. */
export function ShareIntentRouting() {
  const { hasShareIntent, shareIntent, resetShareIntent } =
    useShareIntentContext();

  useEffect(() => {
    if (!hasShareIntent) return;
    const files = shareIntent.files ?? [];

    if (files.length)
      offerImportedFiles(
        files.map((file) => ({
          uri: file.path,
          mimeType: file.mimeType,
          name: file.fileName,
          width: file.width ?? null,
          height: file.height ?? null,
        })),
      );
    resetShareIntent();

    if (files.length) router.navigate("/");
  }, [hasShareIntent, shareIntent, resetShareIntent]);

  return null;
}

export function ShareIntentRoot({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <ShareIntentProvider options={{ resetOnBackground: false }}>
      {children}
    </ShareIntentProvider>
  );
}
