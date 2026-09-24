import { useEffect, useState } from "react";
import { View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useReceiptDetail } from "@/features/receipt-queries";
import { Button, Copy, Icon, Loading, Screen } from "@/components/ui";
import { useHousehold } from "@/features/household-context";
import { ReceiptEditorSession } from "@/features/receipt-editor-session";

export default function ReceiptPage() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return <ReceiptDetail key={id} id={id} />;
}

function ReceiptDetail({ id }: Readonly<{ id: string }>) {
  const { online } = useHousehold();
  const detail = useReceiptDetail(id);

  const [deletion, setDeletion] = useState<"idle" | "deleting" | "deleted">(
    "idle",
  );

  useEffect(() => {
    // The editor has unmounted, so its unsaved-change guard cannot block leaving.
    if (deletion === "deleted") {
      if (router.canGoBack()) router.back();
      else router.replace("/(tabs)/history");
    }
  }, [deletion]);

  if (deletion === "deleted" || (deletion === "deleting" && detail === null))
    return (
      <Screen insetTop={false}>
        <Loading title="Sletter kvittering …" />
      </Screen>
    );

  if (detail === undefined)
    return (
      <Screen insetTop={false}>
        <Loading title="Henter kvittering …" />
      </Screen>
    );

  if (detail === null)
    return (
      <Screen insetTop={false}>
        <Stack.Screen
          options={{ title: "Kvittering", headerRight: () => null }}
        />
        <View style={{ paddingVertical: 48, gap: 16, alignItems: "center" }}>
          <Icon name="doc.questionmark" size={44} />
          <Copy
            accessibilityRole="header"
            size={22}
            weight="600"
            style={{ textAlign: "center" }}
          >
            Kvitteringen er ikke tilgjengelig
          </Copy>
          <Copy muted style={{ textAlign: "center", maxWidth: 340 }}>
            Den kan være slettet.
          </Copy>
          <Button
            title="Til kvitteringene"
            onPress={() => router.dismissTo("/(tabs)/history")}
          />
        </View>
      </Screen>
    );

  return (
    <ReceiptEditorSession
      key={id}
      receipt={detail}
      online={online}
      onDeletionChange={setDeletion}
    />
  );
}
