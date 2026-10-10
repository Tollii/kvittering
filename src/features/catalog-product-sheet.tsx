import { CalendarDate } from "@/lib/domain/calendar";
import { Ore } from "@/lib/domain/ore";
import { useFeatureFlag } from "@/features/featureFlags";
import { useCompleteReceipts } from "./receipt-queries";
import { useState } from "react";
import { Image, View, type ImageStyle, type StyleProp } from "react-native";
import {
  Button,
  Copy,
  Disclosure,
  Empty,
  Field,
  Loading,
  Notice,
  Panel,
  Row,
  Sheet,
} from "@/components/ui";
import { useCatalogProduct, useCatalogSearch } from "./catalog-queries";
import type { CatalogIdentity, CatalogProduct } from "@/lib/catalog/model";
import { catalogInsights } from "@/lib/catalog/insights";
import { productSearch, rankCatalogProducts } from "@/lib/catalog/matching";
import { catalogImageSources } from "@/lib/catalog/images";
import { catalogSource } from "@/lib/catalog/oda";
import { radius, useTheme } from "@/constants/theme";
import { OfflineNotice } from "./offline-notice";

function CatalogSearchField({
  value,
  onChange,
}: Readonly<{ value: string; onChange: (value: string) => void }>) {
  return (
    <Field
      label="Søk i produktkatalogen"
      value={value}
      onChangeText={onChange}
      autoCorrect={false}
      autoCapitalize="none"
      clearButtonMode="while-editing"
      hint="Skriv minst 3 tegn for å søke."
    />
  );
}

function CatalogSearchResults({
  search,
  store,
  onSelect,
}: Readonly<{
  search: string;
  store: string;
  onSelect: (product: CatalogProduct | null) => void;
}>) {
  const productLookup = useFeatureFlag("productLookup");
  const query = useCatalogSearch(search, { kind: "products", store });
  const [showWithoutBarcode, setShowWithoutBarcode] = useState(false);

  const products = rankCatalogProducts(search, query.data?.products ?? []).map(
    ({ product }) => product,
  );

  const hasBarcode = products.some((product) => product.ean);
  const withoutBarcode = products.filter((product) => !product.ean).length;

  return (
    <>
      {!productLookup && (
        <Notice>
          Produktkatalogen er midlertidig satt på pause. Lagrede opplysninger
          vises fortsatt.
        </Notice>
      )}
      <OfflineNotice />
      {((query.isFetching && !query.data) ||
        (productLookup && query.data?.status === "pending")) && (
        <Loading title="Henter produkter …" />
      )}
      {(query.isError || query.data?.status === "error") && (
        <Notice tone="error">
          {query.data?.message ?? "Kunne ikke hente produkter"}
        </Notice>
      )}
      {products
        .filter((product) => !hasBarcode || product.ean || showWithoutBarcode)
        .map((product) => (
          <Panel key={product.key}>
            <View
              style={{ flexDirection: "row", gap: 12, alignItems: "center" }}
            >
              {!!(product.image || product.ean) && (
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
                  onPress={() => onSelect(product)}
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
        <Empty
          title="Ingen produkter funnet"
          message="Prøv et kortere navn eller et annet søkeord."
          icon="magnifyingglass"
        />
      )}
      <Row title="Ingen av produktene passer" onPress={() => onSelect(null)} />
      <Copy muted size={12}>
        Produktdata fra Kassalapp
      </Copy>
    </>
  );
}

/**
 * Shows a linked product, or searches for one when the line has none. Changing
 * the link searches in this same sheet: replacing one presented iOS sheet with
 * another makes the transition stutter, so the one Sheet stays mounted.
 */
export function CatalogProductSheet({
  product,
  name,
  store,
  onSelect,
  onClose,
}: Readonly<{
  product: CatalogIdentity | null;
  name: string;
  store: string;
  onSelect: (product: CatalogProduct | null) => void;
  onClose: () => void;
}>) {
  const [search, setSearch] = useState(product ? null : productSearch(name));

  return (
    <Sheet
      title={search === null ? "Produktinformasjon" : "Finn produkt"}
      visible
      onClose={onClose}
      header={
        search !== null && (
          <CatalogSearchField value={search} onChange={setSearch} />
        )
      }
    >
      {search === null ? (
        product && (
          <CatalogProductDetails
            product={product}
            onChange={() => setSearch(productSearch(name))}
          />
        )
      ) : (
        <CatalogSearchResults
          search={search}
          store={store}
          onSelect={(choice) => {
            onSelect(choice);
            onClose();
          }}
        />
      )}
    </Sheet>
  );
}

function CatalogProductDetails({
  product,
  onChange,
}: Readonly<{ product: CatalogIdentity; onChange: () => void }>) {
  const productLookup = useFeatureFlag("productLookup");
  const query = useCatalogProduct(product.key);
  const full = query.data?.products[0];

  const imageSources = [
    ...new Set([
      ...catalogImageSources(full ?? product),
      ...catalogImageSources(product),
    ]),
  ];

  const { receipts, completeReceipts } = useCompleteReceipts({
    kind: "product",
    key: product.key,
  });

  const purchases = catalogInsights(receipts).products.find(
    (item) => item.id === product.key,
  );

  return (
    <>
      {product.equivalence && (
        <Notice>
          Koblet til tilsvarende produkter. Bildet viser ett eksempel. Nøyaktig
          pakning og strekkode er ikke bekreftet.
        </Notice>
      )}
      {!productLookup && (
        <Notice>
          Produktkatalogen er midlertidig satt på pause. Lagrede opplysninger
          vises fortsatt.
        </Notice>
      )}
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
      <Button
        title="Endre produktkobling"
        variant="secondary"
        onPress={onChange}
      />
      {query.isFetching && !full && <Loading />}
      {(query.isError || query.data?.status === "error") && (
        <Notice tone="error">Produktdetaljene kunne ikke hentes nå.</Notice>
      )}
      {purchases && completeReceipts && (
        <Panel>
          <Copy weight="600">Deres kjøp</Copy>
          <Row title="Kjøpt for" value={Ore.format(purchases.amountOre)} />
          <Copy muted size={13}>
            {
              new Set(purchases.contributions.map((item) => item.receipt._id))
                .size
            }{" "}
            kvitteringer · etter varerabatt
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
                new Map([
                  ["YES", "Inneholder"],
                  ["NO", "Nei"],
                  ["CAN_CONTAIN_TRACES", "Kan inneholde spor"],
                ]).get(item.status) ?? item.status
              }
            />
          ))}
        </Disclosure>
      )}
      {!!full?.ingredients && (
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
      {!!product.ean && (
        <Copy muted size={12}>
          Strekkode: {product.ean}
        </Copy>
      )}
      <Copy size={12} muted>
        Produktdata fra {catalogSource(product.key)}
        {query.data?.fetchedAt
          ? ` · hentet ${CalendarDate.format(CalendarDate.ofInstant(query.data.fetchedAt))}`
          : ""}
      </Copy>
    </>
  );
}

function CatalogImage({
  sources,
  name,
  style,
}: Readonly<{
  sources: string[];
  name: string;
  style: StyleProp<ImageStyle>;
}>) {
  const colors = useTheme();
  const [sourceIndex, setSourceIndex] = useState(0);
  const uri = sources[sourceIndex];

  if (!uri) return null;

  return (
    <Image
      source={{ uri }}
      style={[
        {
          borderRadius: radius.inner,
          borderWidth: 1,
          borderColor: colors.imageOutline,
          backgroundColor: colors.surface,
        },
        style,
      ]}
      resizeMode="contain"
      accessibilityLabel={name}
      onError={() => setSourceIndex((index) => index + 1)}
    />
  );
}
