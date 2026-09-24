import {
  isMissingLineField,
  receiptIssueText,
} from "@/lib/domain/receipt-issues";
import { useDebouncedSearch } from "./catalog-queries";
import { productSearch } from "@/lib/catalog/search";
import {
  productReference,
  type ProductSelection,
} from "@/lib/domain/product-reference";
import { useState } from "react";
import { Pressable, View, useWindowDimensions } from "react-native";
import { useQuery } from "convex-helpers/react/cache";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  Button,
  Chip,
  Copy,
  Field,
  Icon,
  Notice,
  Panel,
  Row,
  Select,
  pressed,
} from "@/components/ui";
import { MoneyField } from "@/components/money-field";
import { categoryById } from "@/lib/domain/categories";
import {
  lineKinds,
  formatMoney,
  isTotalsLine,
  type ReceiptLine,
} from "@/lib/domain/receipt";
import {
  canConfirmSuggestedCategory,
  isCategoryUncertain,
  confirmLineCategory,
  lineReviewIssues,
} from "@/lib/domain/receipt-review";
import { CategoryPicker } from "./category-picker";
import {
  CatalogProductPicker,
  CatalogProductSheet,
} from "./catalog-product-sheet";
import type { CatalogProduct } from "@/lib/catalog/model";
import { useTheme } from "@/constants/theme";
import { priceSignalLabel, type PriceSignal } from "@/lib/domain/price-signals";
import { tapFeedback } from "@/lib/haptics";

export const lineLabels: Record<ReceiptLine["kind"], string> = {
  product: "Vare",
  item_discount: "Varerabatt",
  receipt_discount: "Kvitteringsrabatt",
  deposit: "Pant",
  deposit_return: "Pantretur",
  adjustment: "Justering",
  summary: "Oppsummering (telles ikke)",
  vat: "MVA (telles ikke)",
};

type SelectionChoice<T> = T extends { lineId: string }
  ? Omit<T, "lineId">
  : never;

export type ProductChoice =
  | Exclude<SelectionChoice<ProductSelection>, { kind: "catalog" }>
  | (SelectionChoice<Extract<ProductSelection, { kind: "catalog" }>> & {
      product: CatalogProduct;
    });

type Props = {
  line: ReceiptLine;
  lines: ReceiptLine[];
  receiptId: Id<"receipts">;
  retailer: string;
  remember: boolean;
  recentCategories: string[];
  productChoice?: ProductChoice;
  /** Unusual unit price compared with the household's history for this product. */
  priceSignal?: PriceSignal;
  /** Review mode shows only what needs a decision, with one-tap answers. */
  review?: boolean;
  onChange: (line: ReceiptLine) => void;
  onRemember: (value: boolean) => void;
  onProduct: (choice: ProductChoice) => void;
  onRemove: () => void;
  onMoneyError: (error: string | null) => void;
};

export function ReceiptLineEditor({
  line,
  lines,
  receiptId,
  retailer,
  remember,
  recentCategories,
  productChoice,
  review = false,
  priceSignal,
  onChange,
  onRemember,
  onProduct,
  onRemove,
  onMoneyError,
}: Readonly<Props>) {
  const colors = useTheme();
  const { fontScale } = useWindowDimensions();
  const issues = lineReviewIssues(line);
  const categoryUncertain = line.issues.some(isCategoryUncertain);

  const otherIssues = issues.filter(
    (issue) => issue.code !== "category_uncertain",
  );

  const missingAmount = line.amountOre === null && !isTotalsLine(line.kind);

  const missingName = line.kind === "product" && !line.name.trim();
  const [expanded, setExpanded] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [productOpen, setProductOpen] = useState(false);
  const [details, setDetails] = useState(false);

  const [catalogScreen, setCatalogScreen] = useState<
    "search" | "details" | null
  >(null);

  const catalogProduct =
    productChoice?.kind === "catalog"
      ? productChoice.product
      : productChoice?.kind === "separate" ||
          productChoice?.kind === "new_household" ||
          productChoice?.kind === "household"
        ? null
        : line.catalogProduct;

  const patch = (value: Partial<ReceiptLine>) =>
    onChange({ ...line, ...value, manual: true });

  const reference = productReference(line);
  const productKind = productChoice?.kind ?? reference.kind;
  const productMissing = productKind === "unresolved";

  const productLabel = productMissing
    ? "Mangler produkt"
    : productKind === "separate"
      ? "Holdes separat"
      : productKind === "household" || productKind === "new_household"
        ? "Eget produkt"
        : catalogProduct?.equivalence
          ? "Tilsvarende produkt"
          : "Produkt";

  const category = categoryById.get(line.categoryId ?? "");
  const categoryLabel = category?.name ?? "Velg kategori";

  const confidenceLabel =
    line.confidence != null
      ? `, ${Math.round(line.confidence * 100)} prosent sikker`
      : "";

  const showEditor = expanded || (review && (missingAmount || missingName));

  const kindLabel =
    line.kind === "product" ||
    lineLabels[line.kind].toLocaleLowerCase("nb-NO") ===
      line.name.trim().toLocaleLowerCase("nb-NO")
      ? null
      : lineLabels[line.kind];

  return (
    <View
      style={{
        paddingVertical: 12,
        gap: 8,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${expanded ? "Skjul" : "Rediger"} ${line.name || "ny vare"}, ${formatMoney(line.amountOre)}`}
        accessibilityState={{ expanded }}
        onPress={() => setExpanded(!expanded)}
        style={({ pressed: down }) => ({
          minHeight: 44,
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          opacity: down ? 0.6 : 1,
        })}
      >
        <View style={{ flex: 1, gap: 1 }}>
          <Copy
            size={16}
            weight="600"
            numberOfLines={fontScale > 1.3 ? undefined : 2}
          >
            {line.name || (missingName ? "Navn mangler" : "Ny vare")}
          </Copy>
          {!!(kindLabel || (line.quantity && line.quantity !== 1)) && (
            <Copy size={12} muted>
              {[
                kindLabel,
                line.quantity && line.quantity !== 1
                  ? `${line.quantity} ${line.unit ?? "stk"}`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </Copy>
          )}
        </View>
        <Copy
          size={16}
          weight="600"
          style={{
            flexShrink: 1,
            maxWidth: "45%",
            textAlign: "right",
            color: missingAmount ? colors.warning : colors.text,
          }}
        >
          {missingAmount ? "Beløp?" : formatMoney(line.amountOre)}
        </Copy>
        <Icon
          name={expanded ? "chevron.up" : "chevron.down"}
          size={11}
          color={colors.secondary}
        />
      </Pressable>
      {line.kind === "product" && (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
            paddingBottom: review ? 0 : 6,
          }}
        >
          {review && canConfirmSuggestedCategory(line) ? (
            <>
              <Chip
                label={
                  line.confidence != null && line.confidence < 1
                    ? `${categoryLabel} · ${Math.round(line.confidence * 100)} %`
                    : categoryLabel
                }
                icon="tag"
                tone="warning"
                accessibilityLabel={`Forslag: ${categoryLabel}${confidenceLabel}. Trykk for å velge en annen kategori`}
                onPress={() => setCategoryOpen(true)}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Bekreft kategorien ${categoryLabel} for ${line.name}`}
                onPress={() => {
                  tapFeedback();
                  onChange(confirmLineCategory(line, line.categoryId!));
                }}
                style={(state) => [
                  {
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 5,
                    minHeight: 44,
                    paddingHorizontal: 11,
                    borderRadius: 10,
                    borderCurve: "continuous",
                    backgroundColor: colors.primary,
                  },
                  pressed(state),
                ]}
              >
                <Icon name="checkmark" size={11} color={colors.onPrimary} />
                <Copy
                  size={15}
                  weight="600"
                  style={{ color: colors.onPrimary }}
                >
                  Bekreft kategori
                </Copy>
              </Pressable>
            </>
          ) : (
            <Chip
              label={
                categoryUncertain && line.categoryId === "fallback.unclear"
                  ? "Velg kategori"
                  : categoryLabel
              }
              icon={categoryUncertain ? "tag" : "checkmark.circle"}
              tone={categoryUncertain ? "warning" : "muted"}
              accessibilityLabel={`Kategori for ${line.name}: ${categoryLabel}. Trykk for å endre`}
              onPress={() => setCategoryOpen(true)}
            />
          )}
          {!review && priceSignal && (
            <Chip
              label={priceSignalLabel(priceSignal)}
              icon={priceSignal.ratio > 1 ? "arrow.up" : "arrow.down"}
              tone={priceSignal.ratio > 1 ? "warning" : "success"}
              accessibilityLabel={`${priceSignalLabel(priceSignal)}. Vanlig pris ${formatMoney(priceSignal.typicalOre)}`}
            />
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              catalogProduct
                ? `Produktinformasjon for ${catalogProduct.name}`
                : `${productLabel} for ${line.name}. Endre produktkobling`
            }
            onPress={() =>
              setCatalogScreen(catalogProduct ? "details" : "search")
            }
            style={({ pressed: down }) => ({
              minHeight: 44,
              flexDirection: "row",
              alignItems: "center",
              gap: 5,
              marginLeft: "auto",
              opacity: down ? 0.6 : 1,
            })}
          >
            <Icon
              name={productMissing ? "link" : "checkmark.circle"}
              size={13}
              color={colors.primary}
            />
            <Copy
              size={14}
              weight="600"
              style={{
                color: colors.primary,
              }}
            >
              {productLabel}
            </Copy>
          </Pressable>
        </View>
      )}
      {categoryOpen && (
        <CategoryPicker
          name={line.name}
          value={line.categoryId}
          confidence={categoryUncertain ? line.confidence : null}
          originalText={line.originalText}
          brand={line.brand}
          recent={recentCategories}
          remember={remember}
          onRemember={onRemember}
          onSelect={(categoryId) =>
            onChange(confirmLineCategory(line, categoryId))
          }
          onClose={() => setCategoryOpen(false)}
        />
      )}
      {catalogScreen === "search" && (
        <CatalogProductPicker
          name={line.name}
          store={retailer}
          onSelect={(product) =>
            onProduct(
              product
                ? { kind: "catalog", key: product.key, product }
                : { kind: "separate" },
            )
          }
          onClose={() => setCatalogScreen(null)}
        />
      )}
      {catalogScreen === "details" && catalogProduct && (
        <CatalogProductSheet
          product={catalogProduct}
          onClose={() => setCatalogScreen(null)}
          onChange={() => setCatalogScreen("search")}
        />
      )}
      {otherIssues
        .filter((issue) => !(showEditor && isMissingLineField(issue)))
        .map((issue) => (
          <View
            key={receiptIssueText(issue)}
            style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
          >
            <Icon
              name="exclamationmark.circle"
              size={13}
              color={colors.warning}
            />
            <Copy size={13} style={{ color: colors.warning, flex: 1 }}>
              {receiptIssueText(issue)}
            </Copy>
          </View>
        ))}
      {showEditor && (
        <View style={{ gap: 10, paddingVertical: 6 }}>
          {expanded && !!line.originalText && (
            <Copy muted size={13}>
              Lest: {line.originalText}
            </Copy>
          )}
          {(!review || missingName || expanded) && (
            <Field
              label="Navn"
              value={line.name}
              placeholder="Hva er varen?"
              onChangeText={(name) => patch({ name })}
            />
          )}
          {(!review || missingAmount || expanded) && (
            <MoneyField
              label="Linjesum (kr)"
              value={line.amountOre}
              onChange={(amountOre) => patch({ amountOre })}
              onError={onMoneyError}
            />
          )}
          {expanded && line.kind === "product" && (
            <>
              <Button
                title={
                  productChoice
                    ? "Produktkobling endret"
                    : "Endre produktkobling"
                }
                variant="secondary"
                compact
                onPress={() => setProductOpen(!productOpen)}
              />
              {productOpen && (
                <ProductSelector
                  receiptId={receiptId}
                  retailer={retailer}
                  line={line}
                  choice={productChoice}
                  onChange={onProduct}
                />
              )}
              {details && (
                <>
                  <Field
                    label="Merke"
                    value={line.brand ?? ""}
                    onChangeText={(brand) => patch({ brand: brand || null })}
                  />
                  <Field
                    label="Etiketter (kommadelt)"
                    defaultValue={line.tags.join(", ")}
                    onEndEditing={(event) =>
                      patch({
                        tags: event.nativeEvent.text
                          .split(",")
                          .map((tag) => tag.trim())
                          .filter(Boolean),
                      })
                    }
                  />
                </>
              )}
            </>
          )}
          {expanded && line.kind === "item_discount" && (
            <Select
              label="Rabatten gjelder"
              value={line.relatedLineId ?? ""}
              options={[
                { value: "", label: "Uavklart" },
                ...lines
                  .filter((item) => item.kind === "product")
                  .map((item) => ({ value: item.id, label: item.name })),
              ]}
              onChange={(relatedLineId) =>
                patch({ relatedLineId: relatedLineId || null })
              }
            />
          )}
          {expanded && (
            <Row
              title={details ? "Skjul flere detaljer" : "Flere detaljer"}
              onPress={() => setDetails(!details)}
            />
          )}
          {expanded && details && (
            <Select
              label="Linjetype"
              value={line.kind}
              options={lineKinds.map((kind) => ({
                value: kind,
                label: lineLabels[kind],
              }))}
              onChange={(kind) =>
                patch({
                  kind,
                  categoryId: kind === "product" ? "fallback.unclear" : null,
                  issues: line.issues.filter(
                    (issue) => !isCategoryUncertain(issue),
                  ),
                })
              }
            />
          )}
          {line.issues.some((issue) => !isCategoryUncertain(issue)) && (
            <>
              <Notice tone="warning">
                {line.issues
                  .filter((issue) => !isCategoryUncertain(issue))
                  .join("\n")}
              </Notice>
              <Button
                title="Dette stemmer"
                variant="tint"
                compact
                icon="checkmark"
                onPress={() => {
                  tapFeedback();
                  patch({
                    issues: line.issues.filter((issue) =>
                      isCategoryUncertain(issue),
                    ),
                  });
                }}
              />
            </>
          )}
          {expanded && (
            <Button
              title="Fjern linje"
              variant="danger"
              compact
              onPress={onRemove}
            />
          )}
        </View>
      )}
      {!showEditor &&
        review &&
        line.issues.some((issue) => !isCategoryUncertain(issue)) && (
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Button
              title="Dette stemmer"
              variant="tint"
              compact
              icon="checkmark"
              onPress={() => {
                tapFeedback();
                patch({
                  issues: line.issues.filter((issue) =>
                    isCategoryUncertain(issue),
                  ),
                });
              }}
            />
            <Button
              title="Rediger"
              variant="secondary"
              compact
              onPress={() => setExpanded(true)}
            />
          </View>
        )}
    </View>
  );
}

function ProductSelector({
  receiptId,
  retailer,
  line,
  choice,
  onChange,
}: Readonly<{
  receiptId: Id<"receipts">;
  retailer: string;
  line: ReceiptLine;
  choice?: ProductChoice;
  onChange: (value: ProductChoice) => void;
}>) {
  const [search, setSearch] = useState("");
  const term = useDebouncedSearch(productSearch(search));

  const products = useQuery(api.products.search, {
    receiptId,
    retailer,
    search: term,
  });

  return (
    <Panel tone="plain">
      <Field
        label="Søk etter lagret produkt"
        value={search}
        onChangeText={setSearch}
      />
      <Copy size={13} muted>
        {line.productName || "Ingen sikker produktkobling"}
      </Copy>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Button
            title="Opprett eget produkt"
            variant="secondary"
            compact
            onPress={() => onChange({ kind: "new_household" })}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            title="Hold varen separat"
            variant="secondary"
            compact
            onPress={() => onChange({ kind: "separate" })}
          />
        </View>
      </View>
      {products?.map((product) => (
        <Row
          key={product._id}
          title={product.name}
          selected={
            choice?.kind === "household" && choice.productId === product._id
          }
          onPress={() =>
            onChange({ kind: "household", productId: product._id })
          }
        />
      ))}
    </Panel>
  );
}
