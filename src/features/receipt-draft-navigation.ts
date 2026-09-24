import { Alert } from "react-native";
import { useNavigation } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import type { ReceiptDraft } from "@/lib/receipt-draft";

/** Pending saves retain the same navigation protection as all other unsaved edits. */
export function useDraftNavigation(draft: ReceiptDraft, discard: () => void) {
  const navigation = useNavigation();
  usePreventRemove(
    draft.dirty && draft.operation.kind !== "deleted",
    ({ data }) => {
      Alert.alert("Forkaste endringene?", "Endringene er ikke lagret.", [
        { text: "Fortsett å redigere", style: "cancel" },
        {
          text: "Forkast",
          style: "destructive",
          onPress: () => {
            discard();
            navigation.dispatch(data.action);
          },
        },
      ]);
    },
  );
}
