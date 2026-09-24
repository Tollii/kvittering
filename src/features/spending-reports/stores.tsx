import { nonEmpty } from "@/lib/domain/collections";
import { Ore } from "@/lib/domain/ore";
import { useState } from "react";
import { Platform, View } from "react-native";
import { router } from "expo-router";
import {
  Copy,
  Empty,
  IconButton,
  Loading,
  Notice,
  Panel,
  Row,
  SectionTitle,
  Segments,
  Sheet,
} from "@/components/ui";
import { StoreMap } from "@/components/store-map";
import { useTheme } from "@/constants/theme";
import { formatDate } from "@/lib/format-date";
import {
  storeSpending,
  type StorePurchase,
  type StoreSpendingGroup,
} from "@/lib/domain/store-spending";

function storeName(store: StoreSpendingGroup) {
  const name =
    store.name ||
    (store.chain ? `${store.chain} · Ukjent butikksted` : "Ukjent butikk");

  return name.replace(/_NO\b/g, "").replaceAll("_", " ");
}

function StoreReport({
  purchases,
  onClose,
}: Readonly<{
  purchases: StorePurchase[];
  onClose: () => void;
}>) {
  const colors = useTheme();
  const [dimension, setDimension] = useState<"stores" | "chains">("stores");
  const [selectedId, setSelectedId] = useState<string>();
  const report = storeSpending(purchases);
  const rows = report[dimension];
  const selected = rows.find((store) => store.id === selectedId);

  const points = report.stores.flatMap((store) =>
    store.location
      ? [
          {
            id: store.id,
            name: storeName(store),
            location: store.location,
            amountOre: store.amountOre,
          },
        ]
      : [],
  );

  const mapPoints = nonEmpty(points);

  const unlocated = report.stores.filter((store) => !store.location);

  const unlocatedCount = unlocated.reduce(
    (sum, store) => sum + store.purchases.length,
    0,
  );

  const unlocatedAmount = Ore.sum(unlocated.map((store) => store.amountOre));

  if (!purchases.length)
    return (
      <Empty
        title="Ingen kjøp denne måneden"
        message="Butikker vises her når du har lagret kvitteringer for perioden."
        icon="map"
      />
    );

  if (selected)
    return (
      <>
        <Row
          title={dimension === "stores" ? "Alle butikksteder" : "Alle kjeder"}
          icon="chevron.left"
          onPress={() => setSelectedId(undefined)}
        />
        <Panel>
          <Copy size={23} weight="700">
            {storeName(selected)}
          </Copy>
          {!!selected.address && <Copy muted>{selected.address}</Copy>}
          <Copy size={30} weight="700">
            {Ore.format(selected.amountOre)}
          </Copy>
          <Copy muted>Vareforbruk · {selected.purchases.length} kjøp</Copy>
          <Copy size={14} muted>
            Siste kjøp i perioden: {formatDate(selected.purchases[0]?.date)}
          </Copy>
        </Panel>
        {selected.unknownAmounts > 0 && (
          <Notice tone="warning">
            {selected.unknownAmounts} varelinjer mangler beløp. Summen viser
            kjente beløp.
          </Notice>
        )}
        {selected.purchases.some((purchase) => purchase.provisional) && (
          <Notice>
            Noen kvitteringer venter på kontroll. Beløpene kan endre seg.
          </Notice>
        )}
        <SectionTitle title="Kvitteringer" />
        <Panel>
          {selected.purchases.map((purchase) => (
            <Row
              key={purchase.receiptId}
              title={formatDate(purchase.date)}
              detail={[
                purchase.branch?.name || purchase.retailer,
                purchase.provisional ? "Til kontroll" : undefined,
                purchase.unknownAmounts ? "Ufullstendig beløp" : undefined,
              ]
                .filter(Boolean)
                .join(" · ")}
              value={Ore.format(purchase.amountOre)}
              onPress={() => {
                onClose();
                router.push({
                  pathname: "/receipt/[id]",
                  params: { id: purchase.receiptId },
                });
              }}
            />
          ))}
        </Panel>
      </>
    );

  return (
    <>
      <Segments
        value={dimension}
        onChange={setDimension}
        options={[
          { value: "stores", label: "Butikksteder" },
          { value: "chains", label: "Kjeder" },
        ]}
      />
      <Copy size={14} muted>
        Vareforbruk etter rabatter, uten pant. Samme periode og utvalg som i
        Forbruk.
      </Copy>
      {dimension === "stores" && (
        <>
          {!!mapPoints && (
            <StoreMap stores={mapPoints} onSelect={setSelectedId} />
          )}
          {unlocatedCount > 0 && (
            <Notice icon="mappin.slash">
              {unlocatedCount} kjøp ({Ore.format(unlocatedAmount)}) mangler
              kartposisjon. De er med i listen og kjedetotalene.
            </Notice>
          )}
        </>
      )}
      <SectionTitle
        title={dimension === "stores" ? "Butikksteder" : "Kjeder"}
        detail="Sortert etter vareforbruk"
      />
      <Panel style={{ gap: 0 }}>
        {rows.map((store, index) => {
          const markerIndex = points.findIndex(
            (point) => point.id === store.id,
          );

          const markerLabel =
            Platform.OS === "ios" && dimension === "stores" && markerIndex >= 0
              ? `${markerIndex + 1}. `
              : "";

          return (
            <View
              key={store.id}
              style={{
                borderTopWidth: index ? 1 : 0,
                borderTopColor: colors.line,
                paddingVertical: 8,
              }}
            >
              <Row
                title={`${markerLabel}${storeName(store)}`}
                detail={[
                  `${store.purchases.length} kjøp`,
                  store.address,
                  dimension === "stores" && !store.location
                    ? "Ukjent kartposisjon"
                    : undefined,
                  store.unknownAmounts ? "Ufullstendig beløp" : undefined,
                ]
                  .filter(Boolean)
                  .join(" · ")}
                value={Ore.format(store.amountOre)}
                onPress={() => setSelectedId(store.id)}
              />
            </View>
          );
        })}
      </Panel>
    </>
  );
}

export function StoreSpendingSheet({
  visible,
  onClose,
  purchases,
  periodKey,
  monthLabel,
  onPreviousMonth,
  onNextMonth,
  nextDisabled,
  loading,
}: Readonly<{
  visible: boolean;
  onClose: () => void;
  purchases: StorePurchase[];
  periodKey: string;
  monthLabel: string;
  onPreviousMonth: () => void;
  onNextMonth: () => void;
  nextDisabled: boolean;
  loading: boolean;
}>) {
  return (
    <Sheet
      title="Butikker"
      visible={visible}
      onClose={onClose}
      header={
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <IconButton
            name="chevron.left"
            label="Forrige måned"
            onPress={onPreviousMonth}
          />
          <Copy weight="600" style={{ flex: 1, textAlign: "center" }}>
            {monthLabel}
          </Copy>
          <IconButton
            name="chevron.right"
            label="Neste måned"
            onPress={onNextMonth}
            disabled={nextDisabled}
          />
        </View>
      }
    >
      {visible &&
        (loading ? (
          <Loading title="Henter kjøp …" />
        ) : (
          <StoreReport
            key={periodKey}
            purchases={purchases}
            onClose={onClose}
          />
        ))}
    </Sheet>
  );
}
