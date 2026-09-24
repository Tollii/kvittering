import {
  contributionKey,
  matchLabel,
  productHistory,
  productPrices,
} from "@/lib/domain/insights";
import { ReceiptContextMenu } from "@/components/receipt-context-menu";
import { router, Stack } from "expo-router";
import {
  useCompleteReceipts,
  useReceiptHistory,
} from "@/features/receipt-queries";
import { useDebouncedSearch } from "@/features/catalog-queries";
import { useState } from "react";
import { Platform, View, useWindowDimensions } from "react-native";
import {
  Button,
  Copy,
  Empty,
  Field,
  Loading,
  Notice,
  Panel,
  Row,
  Screen,
  Segments,
  Sheet,
} from "@/components/ui";
import { IllustratedEmpty } from "@/components/monument-artwork";
import { openReceipt } from "@/components/receipt-card";
import { SpendingBars } from "@/components/spending-details";
import { formatMoney } from "@/lib/domain/receipt";
import { formatDate } from "@/lib/format-date";
import { useTheme } from "@/constants/theme";

export default function History() {
  const colors = useTheme();
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
      (b.purchaseDate ?? "").localeCompare(a.purchaseDate ?? "") ||
      b._creationTime - a._creationTime,
  );

  const months = new Map<string, typeof sorted>();

  for (const receipt of sorted) {
    const key = receipt.purchaseDate?.slice(0, 7) ?? "unknown";
    months.set(key, [...(months.get(key) ?? []), receipt]);
  }

  const monthTitle = (key: string) => {
    if (key === "unknown") return "Uten dato";

    const label = new Intl.DateTimeFormat("nb-NO", {
      month: "long",
      year: "numeric",
    }).format(new Date(`${key}-01T12:00:00Z`));

    return label.charAt(0).toLocaleUpperCase("nb-NO") + label.slice(1);
  };

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
            <Stack.Toolbar.Button
              icon="person.2"
              onPress={() => router.push("/settings")}
            >
              Innstillinger
            </Stack.Toolbar.Button>
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
              const total = items.reduce(
                (sum, receipt) => sum + receipt.spendingOre,
                0,
              );

              return (
                <View key={key} style={{ gap: 0 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "baseline",
                      paddingTop: 16,
                      paddingBottom: 12,
                      borderBottomWidth: 1,
                      borderBottomColor: colors.text,
                      gap: 8,
                      flexWrap: "wrap",
                    }}
                  >
                    <Copy
                      accessibilityRole="header"
                      size={15}
                      weight="700"
                      style={fontScale > 1.3 ? { width: "100%" } : { flex: 1 }}
                    >
                      {monthTitle(key)}
                    </Copy>
                    <Copy size={13} weight="600" muted>
                      {items.length}{" "}
                      {items.length === 1 ? "kvittering" : "kvitteringer"} ·{" "}
                      {formatMoney(total)}
                    </Copy>
                  </View>
                  {items.map((receipt) => (
                    <ReceiptContextMenu
                      key={receipt._id}
                      receiptId={receipt._id}
                      store={receipt.store || "Ny kvittering"}
                      amount={formatMoney(receipt.totalOre)}
                      date={formatDate(receipt.purchaseDate)}
                    >
                      <View
                        style={{
                          borderBottomWidth: 1,
                          borderBottomColor: colors.line,
                          paddingVertical: 12,
                        }}
                      >
                        <Row
                          title={receipt.store || "Ny kvittering"}
                          detail={formatDate(receipt.purchaseDate)}
                          value={formatMoney(receipt.totalOre)}
                          onPress={() =>
                            router.push({
                              pathname: "/receipt/[id]",
                              params: { id: receipt._id },
                            })
                          }
                        />
                      </View>
                    </ReceiptContextMenu>
                  ))}
                </View>
              );
            })}
          {tab === "products" && products.length > 0 && (
            <Panel style={{ gap: 0, paddingVertical: 4 }}>
              {products.map((product, index) => (
                <View
                  key={product.key}
                  style={{
                    borderTopWidth: index ? 1 : 0,
                    borderTopColor: colors.line,
                  }}
                >
                  <Row
                    title={product.name || "Ukjent vare"}
                    detail={`${product.purchases.size} kjøp · ${product.linked ? "Koblet produkt" : "Enkeltvare"}`}
                    value={formatMoney(product.amountOre)}
                    onPress={() => setSelectedKey(product.key)}
                  />
                </View>
              ))}
            </Panel>
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
            <Copy size={30} weight="800">
              {formatMoney(selected.amountOre)}
            </Copy>
            <Copy muted>{selected.purchases.size} kjøp</Copy>
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
                  <Copy muted size={12} weight="600">
                    {metric.label}
                  </Copy>
                  <Copy weight="700" size={17}>
                    {formatMoney(metric.amount)}
                  </Copy>
                </View>
              ))}
            </Panel>
            <SpendingBars
              rows={prices.observations.map((observation, index) => ({
                id: String(index),
                name: formatDate(
                  observation.contribution.receipt.data!.purchaseDate,
                ),
                amountOre: observation.ore,
                contributions: [observation.contribution],
              }))}
              onSelect={(row) => {
                setSelectedKey(null);
                openReceipt(row.contributions[0].receipt);
              }}
            />
            {prices.omitted > 0 && (
              <Notice>
                {prices.omitted} kjøp uten dato eller positivt beløp er utelatt
                fra diagrammet.
              </Notice>
            )}
            <Panel style={{ gap: 0, paddingVertical: 4 }}>
              {selected.contributions.map((contribution, index) => (
                <View
                  key={contributionKey(contribution)}
                  style={{
                    borderTopWidth: index ? 1 : 0,
                    borderTopColor: colors.line,
                  }}
                >
                  <Row
                    title={formatDate(contribution.receipt.data?.purchaseDate)}
                    detail={`${contribution.receipt.data?.store} · ${contribution.line ? matchLabel(contribution.line) : ""}`}
                    value={formatMoney(contribution.amountOre)}
                    onPress={() => {
                      setSelectedKey(null);
                      openReceipt(contribution.receipt);
                    }}
                  />
                </View>
              ))}
            </Panel>
          </>
        )}
      </Sheet>
    </Screen>
  );
}
