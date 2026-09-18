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
} from "@/lib/domain/insights";
import { formatMoney } from "@/lib/domain/receipt";
export default function History() {
  const { receipts, loadingReceipts, completeReceipts } = useHousehold();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"receipts" | "products">("receipts");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const matches = (value: string) =>
    value
      .toLocaleLowerCase("nb-NO")
      .includes(search.toLocaleLowerCase("nb-NO"));
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
  const allProducts = productHistory(receipts);
  const products = allProducts.filter((product) => matches(product.name));
  const selected = allProducts.find((product) => product.key === selectedKey);
  const prices = selected ? productPrices(selected.contributions) : null;
  return (
    <Screen title="Historikk" subtitle="Det dere har handlet" settings>
      <Field
        label="Søk i historikk"
        placeholder="Butikk, vare eller etikett"
        value={search}
        onChangeText={setSearch}
        clearButtonMode="while-editing"
      />
      <Segments
        value={tab}
        onChange={setTab}
        options={[
          { value: "receipts", label: "Kvitteringer" },
          { value: "products", label: "Varer" },
        ]}
      />
      {!completeReceipts && (
        <Notice>
          Henter flere kvitteringer. Søkeresultatene er foreløpige.
        </Notice>
      )}
      {loadingReceipts ? (
        <Loading />
      ) : (
        <>
          <Copy muted>
            {tab === "receipts" ? filtered.length : products.length} treff
          </Copy>
          {tab === "receipts"
            ? filtered.map((receipt) => (
                <ReceiptCard key={receipt._id} receipt={receipt} />
              ))
            : products.map((product) => (
                <Panel key={product.key}>
                  <Row
                    title={product.name || "Ukjent vare"}
                    detail={`${product.purchases.size} kjøp · ${product.linked ? "Koblet produkt" : "Enkeltvare"}`}
                    value={formatMoney(product.amountOre)}
                    onPress={() => setSelectedKey(product.key)}
                  />
                </Panel>
              ))}
          {(tab === "receipts" ? filtered : products).length === 0 && (
            <Empty
              title="Ingen treff"
              message="Prøv et annet søk, eller legg til en kvittering."
              icon="magnifyingglass"
            />
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
            <Copy>
              {selected.purchases.size} kjøp · {formatMoney(selected.amountOre)}{" "}
              til sammen
            </Copy>
            <Copy muted>
              {selected.linked
                ? "Samme koblede produkt fra denne butikken."
                : "Varen er ikke bekreftet som en match. Den vises separat."}
            </Copy>
            <View style={{ flexDirection: "row", gap: 12 }}>
              {[
                { label: "Siste", amount: prices.latest },
                { label: "Typisk", amount: prices.typical },
                { label: "Laveste", amount: prices.lowest },
              ].map((metric) => (
                <View key={metric.label} style={{ flex: 1 }}>
                  <Copy muted size={12}>
                    {metric.label}
                  </Copy>
                  <Copy weight="600">{formatMoney(metric.amount)}</Copy>
                </View>
              ))}
            </View>
            <Copy muted size={12}>
              Beløp per kjøp, etter fordelte rabatter. Typisk beløp er medianen.
            </Copy>
            <SpendingBars
              rows={prices.observations.map((observation, index) => ({
                id: String(index),
                name: observation.contribution.receipt.data!.purchaseDate!,
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
            {selected.contributions.map((contribution, index) => (
              <Row
                key={index}
                title={contribution.receipt.data?.purchaseDate ?? "Dato ukjent"}
                detail={`${contribution.receipt.data?.store} · ${contribution.line ? matchLabel(contribution.line) : ""}`}
                value={formatMoney(contribution.amountOre)}
                onPress={() => {
                  setSelectedKey(null);
                  openReceipt(contribution.receipt);
                }}
              />
            ))}
          </>
        )}
      </Sheet>
    </Screen>
  );
}
