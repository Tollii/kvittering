import { useState } from "react";
import { View } from "react-native";
import {
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
import { ReceiptCard, openReceipt } from "@/components/receipt-card";
import { SpendingBars } from "@/components/spending-details";
import { useHousehold } from "@/features/session";
import {
  matchLabel,
  productHistory,
  productPrices,
  receiptMonth,
} from "@/lib/domain/insights";
import { formatMoney, reconcile } from "@/lib/domain/receipt";
import { formatDate } from "@/lib/format-date";
import { useTheme } from "@/constants/theme";
export default function History() {
  const colors = useTheme();
  const { receipts, loadingReceipts, completeReceipts } = useHousehold();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"receipts" | "products">("receipts");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const matches = (value: string) =>
    value
      .toLocaleLowerCase("nb-NO")
      .includes(search.trim().toLocaleLowerCase("nb-NO"));
  const filtered = receipts.filter((receipt) =>
    matches(
      [
        receipt.data?.store,
        receipt.data?.purchaseDate,
        ...(receipt.data?.lines.flatMap((line) => [
          line.name,
          line.originalText,
          ...line.tags,
        ]) ?? []),
      ].join(" "),
    ),
  );
  const sorted = [...filtered].sort(
    (a, b) =>
      (b.data?.purchaseDate ?? "").localeCompare(a.data?.purchaseDate ?? "") ||
      b._creationTime - a._creationTime,
  );
  const months = new Map<string, typeof sorted>();
  for (const receipt of sorted) {
    const key = receiptMonth(receipt) ?? "unknown";
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
    <Screen title="Historikk" settings>
      <Field
        label="Søk"
        placeholder="Butikk, vare eller etikett"
        value={search}
        onChangeText={setSearch}
        clearButtonMode="while-editing"
        autoCorrect={false}
      />
      <Segments
        value={tab}
        onChange={setTab}
        options={[
          { value: "receipts", label: `Kvitteringer (${filtered.length})` },
          { value: "products", label: `Varer (${products.length})` },
        ]}
      />
      {!completeReceipts && <Notice>Henter flere …</Notice>}
      {loadingReceipts ? (
        <Loading />
      ) : (
        <>
          {tab === "receipts" &&
            [...months.entries()].map(([key, items]) => {
              const total = items.reduce(
                (sum, receipt) =>
                  sum +
                  (receipt.data && !receipt.excluded
                    ? reconcile(receipt.data).productSpending
                    : 0),
                0,
              );
              return (
                <View key={key} style={{ gap: 8 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "baseline",
                      paddingTop: 8,
                      paddingHorizontal: 2,
                    }}
                  >
                    <Copy
                      accessibilityRole="header"
                      size={15}
                      weight="700"
                      style={{ flex: 1 }}
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
                    <ReceiptCard key={receipt._id} receipt={receipt} />
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
          {(tab === "receipts" ? filtered : products).length === 0 && (
            <Empty title="Ingen treff" icon="magnifyingglass" />
          )}
        </>
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
            <Panel style={{ flexDirection: "row", gap: 12 }}>
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
                  key={index}
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
