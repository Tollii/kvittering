import { CalendarDate, CalendarMonth } from "@/lib/domain/calendar";
import { Ore } from "@/lib/domain/ore";
import {
  contributionKey,
  matchLabel,
  productHistory,
  productPrices,
} from "@/lib/domain/insights";
import { ReceiptContextMenu } from "@/features/receipt-context-menu";
import { router, Stack } from "expo-router";
import {
  useCompleteReceipts,
  useReceiptHistory,
} from "@/features/receipt-queries";
import { useDebouncedSearch } from "@/features/catalog-queries";
import { useState } from "react";
import { Platform, View, useWindowDimensions } from "react-native";
import {
  Amount,
  Button,
  Copy,
  Empty,
  Field,
  List,
  Loading,
  Notice,
  Panel,
  Row,
  Screen,
  SectionTitle,
  Segments,
  SettingsButton,
  Sheet,
} from "@/components/ui";
import { IllustratedEmpty } from "@/components/monument-artwork";
import { openReceipt } from "@/components/receipt-card";
import { SpendingBars } from "@/components/spending-details";
import { OfflineNotice } from "@/features/offline-notice";

export default function History() {
  const { fontScale } = useWindowDimensions();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"receipts" | "products">("receipts");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const matches = (value: string) =>
    value
      .toLocaleLowerCase("nb-NO")
      .includes(search.trim().toLocaleLowerCase("nb-NO"));

  const term = useDebouncedSearch(search.trim());
  const history = useReceiptHistory(term, tab === "receipts");

  const { receipts, completeReceipts: completeProducts } = useCompleteReceipts(
    { kind: "allProducts" },
    tab === "products",
  );

  const filtered = history.results;

  const completeReceipts =
    tab === "products" ? completeProducts : history.status === "Exhausted";

  const loadingReceipts =
    tab === "products"
      ? !completeProducts
      : history.status === "LoadingFirstPage";

  const sorted = [...filtered].sort(
    (a, b) =>
      CalendarDate.compare(b.purchaseDate, a.purchaseDate) ||
      b._creationTime - a._creationTime,
  );

  const months = new Map<CalendarMonth | "unknown", typeof sorted>();

  for (const receipt of sorted) {
    const key = receipt.purchaseDate
      ? CalendarDate.month(receipt.purchaseDate)
      : "unknown";

    months.set(key, [...(months.get(key) ?? []), receipt]);
  }

  const monthTitle = (key: CalendarMonth | "unknown") =>
    key === "unknown" ? "Uten dato" : CalendarMonth.title(key);

  const allProducts = productHistory(receipts);
  const products = allProducts.filter((product) => matches(product.name));
  const selected = allProducts.find((product) => product.key === selectedKey);
  const prices = selected ? productPrices(selected.contributions) : null;

  return (
    <Screen
      title={Platform.OS === "ios" ? undefined : "Historikk"}
      settings={Platform.OS !== "ios"}
      insetTop={Platform.OS !== "ios"}
    >
      {Platform.OS === "ios" && (
        <>
          <Stack.SearchBar
            placeholder="Butikk, vare eller etikett"
            onChangeText={(event) => setSearch(event.nativeEvent.text)}
            hideWhenScrolling={false}
          />
          <Stack.Toolbar placement="right">
            <Stack.Toolbar.View hidesSharedBackground>
              <SettingsButton />
            </Stack.Toolbar.View>
          </Stack.Toolbar>
        </>
      )}
      {Platform.OS !== "ios" && (
        <Field
          label="Søk"
          placeholder="Butikk, vare eller etikett"
          value={search}
          onChangeText={setSearch}
          clearButtonMode="while-editing"
          autoCorrect={false}
        />
      )}
      <Segments
        value={tab}
        onChange={setTab}
        options={[
          { value: "receipts", label: `Kvitteringer (${filtered.length})` },
          { value: "products", label: `Varer (${products.length})` },
        ]}
      />
      <OfflineNotice />
      {!completeReceipts && (
        <Notice>
          {tab === "products" || term
            ? "Henter hele resultatet …"
            : "Viser innlastede kvitteringer."}
        </Notice>
      )}
      {loadingReceipts ? (
        <Loading />
      ) : (
        <>
          {tab === "receipts" &&
            [...months.entries()].map(([key, items]) => {
              const total = Ore.sum(
                items.map((receipt) => receipt.spendingOre),
              );

              return (
                <View key={key} style={{ gap: 4 }}>
                  <SectionTitle
                    title={monthTitle(key)}
                    detail={`${items.length} ${items.length === 1 ? "kvittering" : "kvitteringer"} · ${Ore.format(total)}`}
                  />
                  <List>
                    {items.map((receipt) => (
                      <ReceiptContextMenu
                        key={receipt._id}
                        receiptId={receipt._id}
                        store={receipt.store || "Ny kvittering"}
                        amount={Ore.format(receipt.totalOre)}
                        date={CalendarDate.format(receipt.purchaseDate)}
                      >
                        <Row
                          title={receipt.store || "Ny kvittering"}
                          detail={CalendarDate.format(receipt.purchaseDate)}
                          value={Ore.format(receipt.totalOre)}
                          onPress={() =>
                            router.push({
                              pathname: "/receipt/[id]",
                              params: { id: receipt._id },
                            })
                          }
                        />
                      </ReceiptContextMenu>
                    ))}
                  </List>
                </View>
              );
            })}
          {tab === "products" && (
            <List>
              {products.map((product) => (
                <Row
                  key={product.key}
                  title={product.name || "Ukjent vare"}
                  detail={`${product.purchases.size} kjøp · ${product.linked ? "Koblet produkt" : "Enkeltvare"}`}
                  value={Ore.format(product.amountOre)}
                  onPress={() => setSelectedKey(product.key)}
                />
              ))}
            </List>
          )}
          {(tab === "receipts" ? filtered : products).length === 0 &&
            (search.trim() || tab === "products" ? (
              <Empty title="Ingen treff" icon="magnifyingglass" />
            ) : (
              <IllustratedEmpty
                scene="history"
                title="Historikken begynner her"
                message="Lagrede kvitteringer vises her når de er behandlet."
              />
            ))}
        </>
      )}
      {tab === "receipts" && history.status === "CanLoadMore" && !term && (
        <Button
          title="Vis flere kvitteringer"
          variant="secondary"
          onPress={() => history.loadMore(30)}
        />
      )}
      <Sheet
        title={selected?.name || "Varehistorikk"}
        visible={!!selected}
        onClose={() => setSelectedKey(null)}
      >
        {selected && prices && (
          <>
            <Amount detail={`${selected.purchases.size} kjøp`}>
              {Ore.format(selected.amountOre)}
            </Amount>
            <Panel
              style={{
                flexDirection: fontScale > 1.3 ? "column" : "row",
                gap: 16,
              }}
            >
              {[
                { label: "Siste", amount: prices.latest },
                { label: "Typisk", amount: prices.typical },
                { label: "Laveste", amount: prices.lowest },
              ].map((metric) => (
                <View key={metric.label} style={{ flex: 1, gap: 2 }}>
                  <Copy muted role="caption" weight="600">
                    {metric.label}
                  </Copy>
                  <Copy weight="700" role="cardTitle">
                    {Ore.format(metric.amount)}
                  </Copy>
                </View>
              ))}
            </Panel>
            <SpendingBars
              rows={prices.observations.map((observation, index) => ({
                id: String(index),
                name: CalendarDate.format(observation.date),
                amountOre: observation.ore,
                contributions: [observation.contribution],
              }))}
              onSelect={(row) => {
                const [contribution] = row.contributions;
                setSelectedKey(null);

                if (contribution) openReceipt(contribution.receipt);
              }}
            />
            {prices.omitted > 0 && (
              <Notice>
                {prices.omitted} kjøp uten dato eller positivt beløp er utelatt
                fra diagrammet.
              </Notice>
            )}
            <List>
              {selected.contributions.map((contribution) => (
                <Row
                  key={contributionKey(contribution)}
                  title={CalendarDate.format(
                    contribution.receipt.data?.purchaseDate,
                  )}
                  detail={`${contribution.receipt.data?.store} · ${contribution.line ? matchLabel(contribution.line) : ""}`}
                  value={Ore.format(contribution.amountOre)}
                  onPress={() => {
                    setSelectedKey(null);
                    openReceipt(contribution.receipt);
                  }}
                />
              ))}
            </List>
          </>
        )}
      </Sheet>
    </Screen>
  );
}
