import { useEffect } from "react";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { Button, Copy, Loading, Notice, Screen } from "@/components/ui";
import { useReceiptHistory } from "@/features/receipt-queries";
import { useHousehold } from "@/features/household-context";
import { latestStoreReceipt, shortcutStore } from "@/lib/shortcut-selection";

export default function ReceiptShortcut() {
  const params = useLocalSearchParams();
  const store = shortcutStore(params.store);
  const { online } = useHousehold();
  const history = useReceiptHistory(store ?? "", !!store);
  const complete = history.status === "Exhausted";

  const receipt =
    store && complete ? latestStoreReceipt(history.results, store) : null;

  const id = receipt?._id;

  useEffect(() => {
    if (id && online)
      router.replace({ pathname: "/receipt/[id]", params: { id } });
  }, [id, online]);

  return (
    <Screen insetTop={false}>
      <Stack.Screen options={{ title: "Finn siste kvittering" }} />
      {!store ? (
        <Notice>Velg et butikknavn på 1 til 100 tegn i snarveien.</Notice>
      ) : !online ? (
        <Notice>
          Koble til nettet for å finne siste kvittering fra {store}.
        </Notice>
      ) : !complete || receipt ? (
        <Loading title={`Finner siste kvittering fra ${store} …`} />
      ) : (
        <Copy>
          Fant ingen datert kvittering fra {store}. Kvitteringer som er utelatt
          eller fortsatt behandles, vises ikke.
        </Copy>
      )}
      <Button
        variant="secondary"
        title="Åpne historikken"
        onPress={() => router.replace("/history")}
      />
    </Screen>
  );
}
