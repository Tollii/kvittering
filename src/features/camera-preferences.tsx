import { useSyncExternalStore } from "react";
import { Platform } from "react-native";
import Storage from "expo-sqlite/kv-store";
import ReceiptIntelligence from "../../modules/receipt-intelligence/src/ReceiptIntelligenceModule";
import { Copy, Toggle } from "@/components/ui";

const key = "camera-visionkit-enabled";

const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
};

const read = () => Storage.getItemSync(key) === "true";

export const documentScannerSupported =
  Platform.OS === "ios" &&
  !!ReceiptIntelligence?.isDocumentScannerSupported?.();

/** A device preference permits direct comparison without changing server flags. */
export function useVisionKitEnabled() {
  return (
    useSyncExternalStore(subscribe, read, () => false) &&
    documentScannerSupported
  );
}

export function CameraPreferences() {
  const enabled = useVisionKitEnabled();

  if (Platform.OS !== "ios") return null;

  return (
    <>
      <Toggle
        label="Bruk VisionKit-skanner"
        value={enabled}
        disabled={!documentScannerSupported}
        onChange={(value) => {
          Storage.setItemSync(key, String(value));

          for (const listener of listeners) listener();
        }}
      />
      <Copy muted size={14}>
        {documentScannerSupported
          ? "Eksperimentelt. Slå av for å bruke det vanlige kameraet. Begge bruker samme kvitteringsbehandling."
          : "VisionKit krever en støttet fysisk iPhone og en oppdatert appversjon."}
      </Copy>
    </>
  );
}
