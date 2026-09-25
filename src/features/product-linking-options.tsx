import { useState } from "react";
import { Pressable, View } from "react-native";
import { Image } from "expo-image";
import { useQuery } from "convex-helpers/react/cache";
import { api } from "../../convex/_generated/api";
import { Copy, Icon, Loading, Notice, pressed } from "@/components/ui";
import { radius, useTheme } from "@/constants/theme";
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

function ProductImage({ product }: Readonly<{ product: CatalogProduct }>) {
  const [index, setIndex] = useState(0);
  const colors = useTheme();
  const sources = catalogImageSources(product);

  return (
    <View
      style={{
        height: 84,
        width: 68,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.productImageBackground,
        borderRadius: radius.inner,
        borderWidth: 1,
        borderColor: colors.imageOutline,
        overflow: "hidden",
      }}
    >
      {sources[index] ? (
        <Image
          source={sources[index]}
          contentFit="contain"
          style={{ width: "100%", height: 80 }}
          recyclingKey={product.key}
          onError={() => setIndex((value) => value + 1)}
          accessible={false}
        />
      ) : (
        <Icon name="photo" size={34} color={colors.productImagePlaceholder} />
      )}
    </View>
  );
}

export function ProductLinkingOptions({
  receiptId,
  line,
  disabled,
  onSelect,
}: Readonly<{
  receiptId: MatchingReceipt["receiptId"];
  line: MatchingLine;
  disabled: boolean;
  onSelect: (product: CatalogProduct) => void;
}>) {
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
      ((saved.length < 4 &&
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
      <View style={{ gap: 10 }}>
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
                flexDirection: "row",
                alignItems: "center",
                padding: 16,
                borderRadius: radius.card,
                borderCurve: "continuous",
                backgroundColor: colors.surface,
                gap: 16,
              },
              pressed(state),
              disabled && { opacity: 0.45 },
            ]}
          >
            <ProductImage product={product} />
            <View style={{ flex: 1, gap: 4 }}>
              <Copy size={16} weight="600">
                {product.name}
              </Copy>
              {!!product.brand && (
                <Copy size={12} muted>
                  {product.brand}
                </Copy>
              )}
            </View>
            <Icon name="chevron.right" size={14} color={colors.secondary} />
          </Pressable>
        ))}
      </View>
      {!candidates.length &&
        (pending ? (
          <Loading title="Finner forslag …" />
        ) : (
          <Notice tone={failed ? "error" : "info"}>
            {failed
              ? "Kunne ikke hente forslag. Du kan prøve et nytt søk."
              : "Ingen forslag funnet. Søk etter et annet navn, eller velg Ingen passer."}
          </Notice>
        ))}
    </>
  );
}
