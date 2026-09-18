import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { Button, Copy, Notice, Panel, Segments } from "@/components/ui";
import { foundationUnavailableReason } from "@/lib/foundation-recognition";
import {
  setProcessingEngine,
  useProcessingEngine,
} from "@/lib/processing-preferences";

export function ProcessingSettings() {
  const engine = useProcessingEngine();
  const [reason, setReason] = useState<string | null | undefined>(undefined);
  const refresh = () => void foundationUnavailableReason().then(setReason);
  useEffect(() => {
    let active = true;
    const check = () =>
      void foundationUnavailableReason().then((value) => {
        if (active) setReason(value);
      });
    check();
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") check();
    });
    return () => {
      active = false;
      listener.remove();
    };
  }, []);
  return (
    <Panel>
      <Copy size={18} weight="600">
        Lesing av kvitteringer
      </Copy>
      <Segments
        value={engine}
        onChange={setProcessingEngine}
        options={[
          { value: "gpt", label: "GPT" },
          { value: "foundation", label: "Foundation Models" },
        ]}
      />
      <Copy size={13} muted>
        {engine === "gpt"
          ? "Bildene leses med GPT. Kategorisering skjer på serveren."
          : "Apple Vision leser teksten. Foundation Models tolker og kategoriserer på denne enheten. Hold appen åpen til lesingen er ferdig."}
      </Copy>
      <Copy size={13} muted>
        Valget gjelder nye kvitteringer og «Les bildene på nytt». Tidligere
        lesinger beholdes for sammenligning.
      </Copy>
      {engine === "foundation" &&
        (reason === undefined ? (
          <Copy muted>Sjekker Apple Intelligence …</Copy>
        ) : reason ? (
          <>
            <Notice>{reason} Appen bytter ikke automatisk til GPT.</Notice>
            <Button
              title="Sjekk tilgjengelighet igjen"
              secondary
              onPress={refresh}
            />
          </>
        ) : (
          <Copy size={13}>Apple Intelligence er tilgjengelig.</Copy>
        ))}
    </Panel>
  );
}
