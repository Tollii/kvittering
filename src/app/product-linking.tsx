import { Ore } from "@/lib/domain/ore";
import { completeReceiptTip } from "@/components/receipt-tip";
import { useTheme } from "@/constants/theme";
import { useRef, useState } from "react";
import { Stack, router } from "expo-router";
import { ActivityIndicator, Platform, View } from "react-native";
import { api } from "../../convex/_generated/api";
import {
  Button,
  Copy,
  Empty,
  Loading,
  Notice,
  Panel,
  Screen,
} from "@/components/ui";
import { useProductLinkingQueue } from "@/features/product-linking-queue";
import { ProductLinkingOptions } from "@/features/product-linking-options";
import { CatalogProductPicker } from "@/features/catalog-product-sheet";
import { useHousehold } from "@/features/household-context";
import { useReleaseMutation } from "@/lib/releases/requests";
import { formatDate } from "@/lib/format-date";
import { errorFeedback, successFeedback } from "@/lib/haptics";
import type { ReceiptCommitAcknowledgement } from "../../convex/receiptChanges";

export default function ProductLinking() {
  const colors = useTheme();
  const queue = useProductLinkingQueue();
  const { online } = useHousehold();
  const choose = useReleaseMutation(api.productLinking.choose);
  const undo = useReleaseMutation(api.productLinking.undo);
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const [error, setError] = useState<string>();
  const [last, setLast] = useState<ReceiptCommitAcknowledgement>();
  const [searchKey, setSearchKey] = useState<string>();
  const item = queue.items[0];

  const itemKey = item
    ? `${item.receiptId}:${item.line.id}:${item.generation}:${item.revision}`
    : undefined;

  async function select(
    choice: { kind: "catalog"; key: string } | { kind: "separate" },
  ) {
    if (!item || locked.current || !online) return;
    locked.current = true;
    setBusy(true);
    setError(undefined);
    setSearchKey(undefined);

    try {
      const result = await choose({
        receiptId: item.receiptId,
        revision: item.revision,
        generation: item.generation,
        lineId: item.line.id,
        choice,
      });

      setLast(result);
      completeReceiptTip("matching");
      successFeedback();
    } catch (cause) {
      errorFeedback();
      setError(
        cause instanceof Error
          ? cause.message
          : "Kunne ikke lagre valget. Prøv igjen.",
      );
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  async function undoLast() {
    if (!last || locked.current || !online) return;
    locked.current = true;
    setBusy(true);
    setError(undefined);

    try {
      await undo({ receiptId: last.receiptId, revision: last.revision });
      setLast(undefined);
      successFeedback();
    } catch (cause) {
      errorFeedback();
      setError(
        cause instanceof Error ? cause.message : "Kunne ikke angre valget.",
      );
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  return (
    <Screen
      summary={
        item && (
          <Panel
            tone="primary"
            style={{
              borderRadius: 0,
              paddingHorizontal: 20,
            }}
          >
            <Copy size={13} style={{ color: colors.onHeroMuted }}>
              {item.store} · {formatDate(item.date)}
            </Copy>
            <Copy size={24} weight="600" style={{ color: colors.onHero }}>
              {item.line.name}
            </Copy>
            {!!item.line.receiptName &&
              item.line.receiptName !== item.line.name && (
                <Copy size={13} style={{ color: colors.onHeroMuted }}>
                  På kvitteringen: {item.line.receiptName}
                </Copy>
              )}
            <Copy size={14} style={{ color: colors.onHero }}>
              {[
                item.line.brand,
                item.line.packageSize && item.line.packageUnit
                  ? `${item.line.packageSize} ${item.line.packageUnit}`
                  : null,
                Ore.format(item.line.amountOre),
              ]
                .filter(Boolean)
                .join(" · ")}
            </Copy>
          </Panel>
        )
      }
      key={itemKey ?? "empty"}
      insetTop={false}
      statusBarStyle="light"
      footer={
        Platform.OS !== "ios" && (last || item) ? (
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flexGrow: 1, flexShrink: 1 }}>
              <Button
                title="Angre"
                variant="secondary"
                compact
                disabled={!last || busy || !online}
                onPress={() => void undoLast()}
              />
            </View>
            {item && (
              <>
                <View style={{ flexGrow: 1, flexShrink: 1 }}>
                  <Button
                    title="Søk"
                    variant="secondary"
                    compact
                    disabled={busy || !online}
                    onPress={() => setSearchKey(itemKey)}
                  />
                </View>
                <View style={{ flexGrow: 1, flexShrink: 1 }}>
                  <Button
                    title="Ingen passer"
                    variant="tint"
                    compact
                    disabled={busy || !online}
                    onPress={() => void select({ kind: "separate" })}
                  />
                </View>
              </>
            )}
          </View>
        ) : undefined
      }
    >
      <Stack.Screen
        options={{
          title: "Koble produkter",
          headerStyle: { backgroundColor: colors.hero },
          headerTintColor: colors.onHero,
          headerTitleStyle: { color: colors.onHero },
        }}
      />
      {Platform.OS === "ios" && (last || item) && (
        <Stack.Toolbar placement="bottom">
          <Stack.Toolbar.Button
            icon="arrow.uturn.backward"
            disabled={!last || busy || !online}
            onPress={() => void undoLast()}
          >
            Angre
          </Stack.Toolbar.Button>
          <Stack.Toolbar.Spacer />
          {item && (
            <Stack.Toolbar.Button
              icon="magnifyingglass"
              disabled={busy || !online}
              onPress={() => setSearchKey(itemKey)}
            >
              Søk
            </Stack.Toolbar.Button>
          )}
          {item && (
            <Stack.Toolbar.Button
              icon="xmark"
              disabled={busy || !online}
              onPress={() => void select({ kind: "separate" })}
            >
              Ingen passer
            </Stack.Toolbar.Button>
          )}
        </Stack.Toolbar>
      )}
      {!online && (
        <Notice icon="wifi.slash">
          Koble til nettet for å lagre produktvalg.
        </Notice>
      )}
      {!!error && <Notice tone="error">{error}</Notice>}
      {busy && <ActivityIndicator accessibilityLabel="Lagrer produktvalg" />}
      {item ? (
        <>
          <Copy size={13} muted>
            {queue.complete ? queue.items.length : `${queue.items.length}+`}{" "}
            varer igjen
          </Copy>
          <Copy weight="600">Hvilket produkt kjøpte dere?</Copy>
          <ProductLinkingOptions
            key={itemKey}
            receiptId={item.receiptId}
            line={item.line}
            disabled={busy || !online}
            onSelect={(product) =>
              void select({ kind: "catalog", key: product.key })
            }
          />
          {searchKey === itemKey && (
            <CatalogProductPicker
              key={`search:${itemKey}`}
              name={item.line.name}
              store={item.store}
              onClose={() => setSearchKey(undefined)}
              onSelect={(product) =>
                void select(
                  product
                    ? { kind: "catalog", key: product.key }
                    : { kind: "separate" },
                )
              }
            />
          )}
        </>
      ) : queue.loading ? (
        <Loading title="Finner varer uten produkt …" />
      ) : (
        <Empty
          title="Alle produktvalg er avklart"
          message="Nye varer uten produktkobling vises her. Kvitteringene beholder godkjenningen sin."
          icon="checkmark.circle"
        >
          <Button
            title="Tilbake til Innboks"
            onPress={() => router.dismissTo("/inbox")}
          />
        </Empty>
      )}
    </Screen>
  );
}
