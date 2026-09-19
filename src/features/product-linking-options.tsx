import { useState } from "react";
import { Pressable, View } from "react-native";
import { Image } from "expo-image";
import { useQuery } from "convex-helpers/react/cache";
import { api } from "../../convex/_generated/api";
import { Copy, Icon, Loading, Notice, pressed } from "@/components/ui";
import { useTheme } from "@/constants/theme";
import { useCatalogSearch } from "./catalog-queries";
import { useFeatureFlag } from "./featureFlags";
import { catalogImageSources } from "@/lib/catalog/images";
import { broaderProductSearch } from "@/lib/catalog/search";
import {
  rankCatalogProducts,
  compatibleCatalogProduct,
} from "@/lib/catalog/matching";
import type { CatalogProduct } from "@/lib/catalog/model";
import type {
  MatchingReceipt,
  MatchingLine,
} from "@/lib/domain/product-linking";

function ProductImage({ product }: { product: CatalogProduct }) {
  const [index, setIndex] = useState(0);
  const sources = catalogImageSources(product);
  return (
    <View
      style={{
        height: 108,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#FFFFFF",
        borderRadius: 12,
      }}
    >
      {sources[index] ? (
        <Image
          source={sources[index]}
          contentFit="contain"
          style={{ width: "100%", height: 100 }}
          recyclingKey={product.key}
          onError={() => setIndex((value) => value + 1)}
          accessible={false}
        />
      ) : (
        <Icon name="photo" size={34} color="#777777" />
      )}
    </View>
  );
}

export function ProductLinkingOptions({
  receiptId,
  line,
  disabled,
  onSelect,
}: {
  receiptId: MatchingReceipt["receiptId"];
  line: MatchingLine;
  disabled: boolean;
  onSelect: (product: CatalogProduct) => void;
}) {
  const colors = useTheme();
  const allowed = useFeatureFlag("productLookup");
  const saved = useQuery(api.productLinking.candidates, {
    receiptId,
    lineId: line.id,
  });
  const name = line.receiptName || line.name;
  const search = useCatalogSearch(
    name,
    { kind: "products" },
    saved !== undefined && saved.length < 4,
  );
  const broadTerm = broaderProductSearch(name);
  const needsBroaderSearch =
    !!broadTerm &&
    search.data?.status === "ready" &&
    search.data.products.length === 0;
  const broader = useCatalogSearch(
    broadTerm ?? "",
    { kind: "products" },
    needsBroaderSearch,
  );
  const ranked = rankCatalogProducts(name, [
    ...(search.data?.products ?? []),
    ...(broader.data?.products ?? []),
  ])
    .sort(
      (a, b) =>
        Number(compatibleCatalogProduct(line, b.product)) -
        Number(compatibleCatalogProduct(line, a.product)),
    )
    .map(({ product }) => product);
  // Keep the saved ranking stable while additional search results arrive.
  const candidates = [
    ...new Map(
      [...(saved ?? []), ...ranked].map((product) => [product.key, product]),
    ).values(),
  ].slice(0, 4);
  const pending =
    saved === undefined ||
    (allowed &&
      ((saved !== undefined &&
        saved.length < 4 &&
        name.trim().length >= 3 &&
        !search.data &&
        !search.isError) ||
        search.isFetching ||
        search.data?.status === "pending" ||
        broader.isFetching ||
        (needsBroaderSearch && !broader.data && !broader.isError) ||
        broader.data?.status === "pending"));
  const failed =
    search.isError ||
    broader.isError ||
    search.data?.status === "error" ||
    broader.data?.status === "error";
  return (
    <>
      {!allowed && (
        <Notice>
          Produktkatalogen er midlertidig satt på pause. Lagrede forslag vises
          fortsatt.
        </Notice>
      )}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        {candidates.map((product) => (
          <Pressable
            key={product.key}
            accessibilityRole="button"
            accessibilityLabel={`Velg ${product.name}`}
            accessibilityState={{ disabled }}
            disabled={disabled}
            onPress={() => onSelect(product)}
            style={(state) => [
              {
                width: "47.8%",
                flexGrow: 1,
                maxWidth: "49%",
                padding: 12,
                borderRadius: 18,
                borderCurve: "continuous",
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.line,
                gap: 8,
                opacity: disabled ? 0.5 : 1,
              },
              pressed(state),
            ]}
          >
            <ProductImage product={product} />
            <Copy size={15} weight="600">
              {product.name}
            </Copy>
            {!!product.brand && (
              <Copy size={12} muted>
                {product.brand}
              </Copy>
            )}
          </Pressable>
        ))}
      </View>
      {!candidates.length &&
        (pending ? (
          <Loading title="Finner forslag …" />
        ) : (
          <Notice>
            {failed
              ? "Kunne ikke hente forslag. Du kan prøve et nytt søk."
              : "Ingen forslag funnet. Søk etter et annet navn, eller velg Ingen passer."}
          </Notice>
        ))}
    </>
  );
}
