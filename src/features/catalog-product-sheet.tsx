import { useState } from "react";
import { Image, View, type ImageStyle, type StyleProp } from "react-native";
import {
  Button,
  Copy,
  Disclosure,
  Field,
  Loading,
  Notice,
  Panel,
  Row,
  Sheet,
} from "@/components/ui";
import {
  useCatalogProduct,
  useCatalogPrices,
  useCatalogSearch,
} from "./catalog-queries";
import type { CatalogIdentity, CatalogProduct } from "@/lib/catalog/model";
import { formatMoney } from "@/lib/domain/receipt";
import { formatDate } from "@/lib/format-date";
import { catalogInsights } from "@/lib/catalog/insights";
import { productSearch, rankCatalogProducts } from "@/lib/catalog/matching";
import { catalogImageSources } from "@/lib/catalog/images";
import { useHousehold } from "./session";

export function CatalogProductPicker({
  name,
  onSelect,
  onClose,
}: {
  name: string;
  onSelect: (product: CatalogProduct | null) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState(productSearch(name));
  const query = useCatalogSearch(search);
  const [showWithoutBarcode, setShowWithoutBarcode] = useState(false);
  const products = rankCatalogProducts(search, query.data?.products ?? []).map(
    ({ product }) => product,
  );
  const hasBarcode = products.some((product) => product.ean);
  const withoutBarcode = products.filter((product) => !product.ean).length;
  const { online } = useHousehold();
  return (
    <Sheet
      title="Finn produkt"
      visible
      onClose={onClose}
      header={
        <Field
          label="Søk i produktkatalogen"
          value={search}
          onChangeText={setSearch}
          autoCorrect={false}
          autoCapitalize="none"
        />
      }
    >
      {!online && <Notice icon="wifi.slash">Uten nett</Notice>}
      {((query.isFetching && !query.data) ||
        query.data?.status === "pending") && (
        <Loading title="Henter produkter …" />
      )}
      {(query.isError || query.data?.status === "error") && (
        <Notice>{query.data?.message ?? "Kunne ikke hente produkter"}</Notice>
      )}
      {products
        .filter((product) => !hasBarcode || product.ean || showWithoutBarcode)
        .map((product) => (
          <Panel key={product.key}>
            <View
              style={{ flexDirection: "row", gap: 12, alignItems: "center" }}
            >
              {(product.image || product.ean) && (
                <CatalogImage
                  key={product.key}
                  sources={catalogImageSources(product)}
                  style={{ width: 52, height: 60 }}
                  name={product.name}
                />
              )}
              <View style={{ flex: 1 }}>
                <Row
                  title={product.name}
                  detail={[
                    product.brand,
                    product.categories.at(-1),
                    !product.ean ? "Uten strekkode" : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  onPress={() => {
                    onSelect(product);
                    onClose();
                  }}
                />
              </View>
            </View>
          </Panel>
        ))}
      {hasBarcode && withoutBarcode > 0 && (
        <Row
          title={
            showWithoutBarcode
              ? "Skjul oppføringer uten strekkode"
              : `Andre oppføringer uten strekkode (${withoutBarcode})`
          }
          onPress={() => setShowWithoutBarcode(!showWithoutBarcode)}
        />
      )}
      {query.data?.status === "ready" && !query.data.products.length && (
        <Copy muted>Ingen treff</Copy>
      )}
      <Row
        title="Ingen av produktene passer"
        onPress={() => {
          onSelect(null);
          onClose();
        }}
      />
      <Copy muted size={12}>
        Produktdata fra Kassalapp
      </Copy>
    </Sheet>
  );
}

export function CatalogProductSheet({
  product,
  onChange,
  onClose,
}: {
  product: CatalogIdentity;
  onChange: () => void;
  onClose: () => void;
}) {
  const query = useCatalogProduct(product.key);
  const [showPrices, setShowPrices] = useState(false);
  const prices = useCatalogPrices(product.key, showPrices);
  const full = query.data?.products[0];
  const imageSources = [
    ...new Set([
      ...catalogImageSources(full ?? product),
      ...catalogImageSources(product),
    ]),
  ];
  const { receipts, completeReceipts } = useHousehold();
  const purchases = catalogInsights(receipts).products.find(
    (item) => item.id === product.key,
  );
  return (
    <Sheet title="Produktinformasjon" visible onClose={onClose}>
      {imageSources.length > 0 && (
        <CatalogImage
          key={imageSources.join("|")}
          sources={imageSources}
          style={{ height: 160, width: "100%" }}
          name={full?.name ?? product.name}
        />
      )}
      <Copy size={21} weight="700">
        {full?.name ?? product.name}
      </Copy>
      <Copy muted>
        {[
          full?.brand ?? product.brand,
          product.weight && product.weightUnit
            ? `${product.weight} ${product.weightUnit}`
            : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      </Copy>
      {!!full?.categories.length && (
        <Copy size={13} muted>
          {full.categories.join(" › ")}
        </Copy>
      )}
      <Button title="Endre produktkobling" secondary onPress={onChange} />
      {query.isFetching && !full && <Loading />}
      {(query.isError || query.data?.status === "error") && (
        <Notice>Produktdetaljene kunne ikke hentes nå.</Notice>
      )}
      {purchases && (
        <Panel>
          <Copy weight="600">Deres kjøp</Copy>
          <Row title="Kjøpt for" value={formatMoney(purchases.amountOre)} />
          <Copy muted size={13}>
            {
              new Set(purchases.contributions.map((item) => item.receipt._id))
                .size
            }{" "}
            kvitteringer · etter varerabatt
            {!completeReceipts ? " · henter flere kjøp" : ""}
          </Copy>
        </Panel>
      )}
      {!!full?.allergens.length && (
        <Disclosure title="Allergener">
          {full.allergens.map((item) => (
            <Row
              key={item.name}
              title={item.name}
              value={
                (
                  {
                    YES: "Inneholder",
                    NO: "Nei",
                    CAN_CONTAIN_TRACES: "Kan inneholde spor",
                  } as Record<string, string>
                )[item.status] ?? item.status
              }
            />
          ))}
        </Disclosure>
      )}
      {full?.ingredients && (
        <Disclosure title="Ingredienser">
          <Copy size={14}>{full.ingredients}</Copy>
        </Disclosure>
      )}
      {!!full?.nutrition.length && (
        <Disclosure title="Næringsinnhold">
          {full.nutrition.map((item) => (
            <Row
              key={item.name}
              title={item.name}
              value={`${item.amount ?? "–"} ${item.unit ?? ""}`}
            />
          ))}
        </Disclosure>
      )}
      {!!full?.labels.length && (
        <Copy size={13}>{full.labels.join(" · ")}</Copy>
      )}
      {product.ean && (
        <Copy muted size={12}>
          Strekkode: {product.ean}
        </Copy>
      )}
      {!showPrices ? (
        <Button
          title="Hent butikkpriser"
          secondary
          onPress={() => setShowPrices(true)}
        />
      ) : (
        <Panel>
          <Copy weight="600">Priser i katalogen</Copy>
          {((prices.isFetching && !prices.data) ||
            prices.data?.status === "pending") && (
            <Loading title="Henter priser …" />
          )}
          {(prices.isError || prices.data?.status === "error") && (
            <Notice>
              {prices.data?.message ?? "Prisene kunne ikke hentes nå."}
            </Notice>
          )}
          {prices.data?.prices.map((price, index) => (
            <Row
              key={`${price.store}-${index}`}
              title={price.store}
              detail={
                price.checkedAt
                  ? formatDate(price.checkedAt.slice(0, 10))
                  : "Dato ukjent"
              }
              value={formatMoney(price.priceOre)}
            />
          ))}
          {prices.data?.status === "ready" && !prices.data.prices.length && (
            <Copy muted>Ingen priser</Copy>
          )}
        </Panel>
      )}
      <Copy size={12} muted>
        Produktdata fra Kassalapp
        {query.data?.fetchedAt
          ? ` · hentet ${formatDate(new Date(query.data.fetchedAt).toISOString().slice(0, 10))}`
          : ""}
      </Copy>
    </Sheet>
  );
}

function CatalogImage({
  sources,
  name,
  style,
}: {
  sources: string[];
  name: string;
  style: StyleProp<ImageStyle>;
}) {
  const [sourceIndex, setSourceIndex] = useState(0);
  const uri = sources[sourceIndex];
  if (!uri) return null;
  return (
    <Image
      source={{ uri }}
      style={style}
      resizeMode="contain"
      accessibilityLabel={name}
      onError={() => setSourceIndex((index) => index + 1)}
    />
  );
}
