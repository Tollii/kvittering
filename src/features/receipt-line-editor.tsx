import { useDebouncedSearch } from "./catalog-queries";
import { productSearch } from "@/lib/catalog/search";
import type { ProductSelection } from "@/lib/domain/product-reference";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { useQuery } from "convex/react";
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
import { lineKinds, formatMoney, type ReceiptLine } from "@/lib/domain/receipt";
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
}: Props) {
  const colors = useTheme();
  const issues = lineReviewIssues(line);
  const categoryUncertain = line.issues.some(isCategoryUncertain);
  const otherIssues = issues.filter((issue) => !isCategoryUncertain(issue));
  const missingAmount =
    line.amountOre === null && !["summary", "vat"].includes(line.kind);
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
  const category = categoryById.get(line.categoryId ?? "");
  const categoryLabel = category?.name ?? "Velg kategori";
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
        borderBottomWidth: 1,
        borderBottomColor: colors.line,
        paddingVertical: review ? 10 : 4,
        gap: review ? 8 : 0,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${expanded ? "Skjul" : "Rediger"} ${line.name || "ny vare"}, ${formatMoney(line.amountOre)}`}
        accessibilityState={{ expanded }}
        onPress={() => setExpanded(!expanded)}
        style={({ pressed: down }) => ({
          minHeight: 40,
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          opacity: down ? 0.6 : 1,
        })}
      >
        <View style={{ flex: 1, gap: 1 }}>
          <Copy size={16} weight="600" numberOfLines={2}>
            {line.name || (missingName ? "Navn mangler" : "Ny vare")}
          </Copy>
          {(kindLabel || (line.quantity && line.quantity !== 1)) && (
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
            flexShrink: 0,
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
                  typeof line.confidence === "number" && line.confidence < 1
                    ? `${categoryLabel} · ${Math.round(line.confidence * 100)} %`
                    : categoryLabel
                }
                icon="tag"
                tone="warning"
                accessibilityLabel={`Forslag: ${categoryLabel}${typeof line.confidence === "number" ? `, ${Math.round(line.confidence * 100)} prosent sikker` : ""}. Trykk for å velge en annen kategori`}
                onPress={() => setCategoryOpen(true)}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Bekreft kategorien ${categoryLabel} for ${line.name}`}
                onPress={() => {
                  tapFeedback();
                  onChange(confirmLineCategory(line, line.categoryId!));
                }}
                hitSlop={6}
                style={(state) => [
                  {
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 5,
                    minHeight: 30,
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
                  size={13}
                  weight="700"
                  style={{ color: colors.onPrimary }}
                >
                  Riktig
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
              icon="tag"
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
          {!review && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                catalogProduct
                  ? `Produktinformasjon for ${catalogProduct.name}`
                  : `Finn produkt for ${line.name}`
              }
              onPress={() =>
                setCatalogScreen(catalogProduct ? "details" : "search")
              }
              hitSlop={6}
              style={({ pressed: down }) => ({
                minHeight: 30,
                flexDirection: "row",
                alignItems: "center",
                gap: 5,
                marginLeft: "auto",
                opacity: down ? 0.6 : 1,
              })}
            >
              <Icon
                name={catalogProduct ? "checkmark.seal" : "magnifyingglass"}
                size={13}
                color={catalogProduct ? colors.accent : colors.secondary}
              />
              <Copy
                size={13}
                weight="500"
                style={{
                  color: catalogProduct ? colors.accent : colors.secondary,
                }}
              >
                {catalogProduct?.equivalence
                  ? "Tilsvarende produkt"
                  : catalogProduct
                    ? "Produkt"
                    : "Finn produkt"}
              </Copy>
            </Pressable>
          )}
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
        .filter(
          (issue) =>
            !(
              showEditor &&
              ["Beløpet mangler.", "Varenavnet mangler."].includes(issue)
            ),
        )
        .map((issue) => (
          <View
            key={issue}
            style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
          >
            <Icon
              name="exclamationmark.circle"
              size={13}
              color={colors.warning}
            />
            <Copy size={13} style={{ color: colors.warning, flex: 1 }}>
              {issue}
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
                secondary
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
                  kind: kind as ReceiptLine["kind"],
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
                tint
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
            <Button title="Fjern linje" danger compact onPress={onRemove} />
          )}
        </View>
      )}
      {!showEditor &&
        review &&
        line.issues.some((issue) => !isCategoryUncertain(issue)) && (
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Button
              title="Dette stemmer"
              tint
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
              secondary
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
}: {
  receiptId: Id<"receipts">;
  retailer: string;
  line: ReceiptLine;
  choice?: ProductChoice;
  onChange: (value: ProductChoice) => void;
}) {
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
            secondary
            compact
            onPress={() => onChange({ kind: "new_household" })}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            title="Hold varen separat"
            secondary
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
