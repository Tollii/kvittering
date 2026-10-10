import { Ore } from "@/lib/domain/ore";
import { receiptIssueText } from "@/lib/domain/receipt-issues";
import type { ProductChoice } from "@/lib/domain/product-reference";
import { useDebouncedSearch } from "./catalog-queries";
import { productSearch } from "@/lib/catalog/search";
import { productReference } from "@/lib/domain/product-reference";
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
import {
  category,
  parseCategoryId,
  unclearCategoryId,
  type CategoryId,
} from "@/lib/domain/categories";
import {
  lineKinds,
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
import { CatalogProductSheet } from "./catalog-product-sheet";
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

  const [catalogOpen, setCatalogOpen] = useState(false);

  const catalogProduct = linkedCatalogProduct(line, productChoice);

  const patch = (value: Partial<ReceiptLine>) =>
    onChange({ ...line, ...value, manual: true });

  const reference = productReference(line);
  const productKind = productChoice?.kind ?? reference.kind;

  const showEditor = expanded || (review && (missingAmount || missingName));

  // The reader's remarks about the line, apart from an uncertain category.
  const readerIssues = line.issues.filter(
    (issue) => !isCategoryUncertain(issue),
  );

  function acceptReaderIssues() {
    tapFeedback();
    patch({
      issues: line.issues.filter((issue) => isCategoryUncertain(issue)),
    });
  }

  return (
    <View
      style={{
        paddingVertical: 12,
        gap: 8,
      }}
    >
      <LineHeader
        line={line}
        expanded={expanded}
        missingName={missingName}
        missingAmount={missingAmount}
        fontScale={fontScale}
        onPress={() => setExpanded(!expanded)}
      />
      {line.kind === "product" && (
        <LineProductRow
          line={line}
          review={review}
          categoryUncertain={categoryUncertain}
          priceSignal={priceSignal}
          catalogProduct={catalogProduct}
          productKind={productKind}
          onOpenCategory={() => setCategoryOpen(true)}
          onConfirmCategory={(categoryId) => {
            tapFeedback();
            onChange(confirmLineCategory(line, categoryId));
          }}
          onOpenCatalog={() => setCatalogOpen(true)}
        />
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
      {catalogOpen && (
        <CatalogProductSheet
          product={catalogProduct ?? null}
          name={line.name}
          store={retailer}
          onSelect={(product) => onProduct(catalogChoice(product))}
          onClose={() => setCatalogOpen(false)}
        />
      )}
      {/* The open editor shows missing fields in its inputs and reader issues in a notice. */}
      {!showEditor &&
        otherIssues.map((issue) => (
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
          {expanded && (
            <ExpandedLineFields
              line={line}
              lines={lines}
              receiptId={receiptId}
              retailer={retailer}
              productChoice={productChoice}
              productOpen={productOpen}
              details={details}
              patch={patch}
              onToggleProduct={() => setProductOpen(!productOpen)}
              onToggleDetails={() => setDetails(!details)}
              onProduct={onProduct}
            />
          )}
          {readerIssues.length > 0 && (
            <>
              <Notice tone="warning">{readerIssues.join("\n")}</Notice>
              <Button
                title="Dette stemmer"
                variant="tint"
                compact
                icon="checkmark"
                onPress={acceptReaderIssues}
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
      {/* The line header expands the editor, so accepting is the one button. */}
      {!showEditor && review && readerIssues.length > 0 && (
        <View style={{ flexDirection: "row" }}>
          <Button
            title="Dette stemmer"
            variant="tint"
            compact
            icon="checkmark"
            accessibilityLabel={`Merknadene om ${line.name} stemmer`}
            onPress={acceptReaderIssues}
          />
        </View>
      )}
    </View>
  );
}

/** A product choice made in this draft replaces the line's catalog product. */
function linkedCatalogProduct(
  line: ReceiptLine,
  productChoice: ProductChoice | undefined,
) {
  if (productChoice?.kind === "catalog") return productChoice.product;

  const catalogReplaced =
    productChoice?.kind === "separate" ||
    productChoice?.kind === "new_household" ||
    productChoice?.kind === "household";

  return catalogReplaced ? null : line.catalogProduct;
}

/** A catalog product links the line; no product keeps the line separate. */
function catalogChoice(
  product: Extract<ProductChoice, { kind: "catalog" }>["product"] | null,
): ProductChoice {
  return product
    ? { kind: "catalog", key: product.key, product }
    : { kind: "separate" };
}

/** The line name, amount, and kind or quantity. A press expands the editor. */
function LineHeader({
  line,
  expanded,
  missingName,
  missingAmount,
  fontScale,
  onPress,
}: Readonly<{
  line: ReceiptLine;
  expanded: boolean;
  missingName: boolean;
  missingAmount: boolean;
  fontScale: number;
  onPress: () => void;
}>) {
  const colors = useTheme();
  const detail = lineDetail(line);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${expanded ? "Skjul" : "Rediger"} ${line.name || "ny vare"}, ${Ore.format(line.amountOre)}`}
      accessibilityState={{ expanded }}
      onPress={onPress}
      style={(state) => [
        {
          minHeight: 44,
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
        },
        pressed(state),
      ]}
    >
      <View style={{ flex: 1, gap: 1 }}>
        <Copy
          size={16}
          weight="600"
          numberOfLines={fontScale > 1.3 ? undefined : 2}
        >
          {line.name || (missingName ? "Navn mangler" : "Ny vare")}
        </Copy>
        {!!detail && (
          <Copy size={12} muted>
            {detail}
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
        {missingAmount ? "Beløp?" : Ore.format(line.amountOre)}
      </Copy>
      <Icon
        name={expanded ? "chevron.up" : "chevron.down"}
        size={11}
        color={colors.secondary}
      />
    </Pressable>
  );
}

/**
 * The line kind when the name does not already tell it, and a quantity
 * other than one. Empty when neither applies.
 */
function lineDetail(line: ReceiptLine): string {
  const kindLabel =
    line.kind === "product" ||
    lineLabels[line.kind].toLocaleLowerCase("nb-NO") ===
      line.name.trim().toLocaleLowerCase("nb-NO")
      ? null
      : lineLabels[line.kind];

  const quantity =
    line.quantity && line.quantity !== 1
      ? `${line.quantity} ${line.unit ?? "stk"}`
      : null;

  return [kindLabel, quantity].filter(Boolean).join(" · ");
}

/** The category, price signal, and product link of a product line. */
function LineProductRow({
  line,
  review,
  categoryUncertain,
  priceSignal,
  catalogProduct,
  productKind,
  onOpenCategory,
  onConfirmCategory,
  onOpenCatalog,
}: Readonly<{
  line: ReceiptLine;
  review: boolean;
  categoryUncertain: boolean;
  priceSignal?: PriceSignal;
  catalogProduct: ReturnType<typeof linkedCatalogProduct>;
  productKind:
    | ProductChoice["kind"]
    | ReturnType<typeof productReference>["kind"];
  onOpenCategory: () => void;
  onConfirmCategory: (categoryId: CategoryId) => void;
  onOpenCatalog: () => void;
}>) {
  const colors = useTheme();
  const productMissing = productKind === "unresolved";
  const productLabel = productLinkLabel(productKind, catalogProduct);
  const categoryId = parseCategoryId(line.categoryId);

  const categoryLabel = categoryId
    ? category(categoryId).name
    : "Velg kategori";

  return (
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
        <CategorySuggestion
          line={line}
          categoryLabel={categoryLabel}
          onOpenCategory={onOpenCategory}
          onConfirmCategory={onConfirmCategory}
        />
      ) : (
        <Chip
          label={
            categoryUncertain && line.categoryId === unclearCategoryId
              ? "Velg kategori"
              : categoryLabel
          }
          icon={categoryUncertain ? "tag" : "checkmark.circle"}
          tone={categoryUncertain ? "warning" : "muted"}
          accessibilityLabel={`Kategori for ${line.name}: ${categoryLabel}. Trykk for å endre`}
          onPress={onOpenCategory}
        />
      )}
      {!review && priceSignal && <PriceSignalChip signal={priceSignal} />}
      {/* Product linking is optional, so review mode keeps the category decision alone. */}
      {!review && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            catalogProduct
              ? `Produktinformasjon for ${catalogProduct.name}`
              : `${productLabel} for ${line.name}. Endre produktkobling`
          }
          onPress={onOpenCatalog}
          style={(state) => [
            {
              minHeight: 44,
              flexDirection: "row",
              alignItems: "center",
              gap: 5,
              marginLeft: "auto",
            },
            pressed(state),
          ]}
        >
          <Icon
            name={productMissing ? "link" : "checkmark.circle"}
            size={13}
            color={colors.primary}
          />
          <Copy size={14} weight="600" style={{ color: colors.primary }}>
            {productLabel}
          </Copy>
        </Pressable>
      )}
    </View>
  );
}

function productLinkLabel(
  productKind:
    | ProductChoice["kind"]
    | ReturnType<typeof productReference>["kind"],
  catalogProduct: ReturnType<typeof linkedCatalogProduct>,
): string {
  if (productKind === "unresolved") return "Mangler produkt";

  if (productKind === "separate") return "Holdes separat";

  if (productKind === "household" || productKind === "new_household")
    return "Eget produkt";

  return catalogProduct?.equivalence ? "Tilsvarende produkt" : "Produkt";
}

/** A suggested category in review mode, with a one-tap confirmation. */
function CategorySuggestion({
  line,
  categoryLabel,
  onOpenCategory,
  onConfirmCategory,
}: Readonly<{
  line: ReceiptLine & { categoryId: CategoryId };
  categoryLabel: string;
  onOpenCategory: () => void;
  onConfirmCategory: (categoryId: CategoryId) => void;
}>) {
  const confidenceLabel =
    line.confidence != null
      ? `, ${Math.round(line.confidence * 100)} prosent sikker`
      : "";

  return (
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
        onPress={onOpenCategory}
      />
      <Button
        title="Bekreft"
        variant="tint"
        compact
        icon="checkmark"
        accessibilityLabel={`Bekreft kategorien ${categoryLabel} for ${line.name}`}
        onPress={() => onConfirmCategory(line.categoryId)}
      />
    </>
  );
}

function PriceSignalChip({ signal }: Readonly<{ signal: PriceSignal }>) {
  return (
    <Chip
      label={priceSignalLabel(signal)}
      icon={signal.ratio > 1 ? "arrow.up" : "arrow.down"}
      tone={signal.ratio > 1 ? "warning" : "success"}
      accessibilityLabel={`${priceSignalLabel(signal)}. Vanlig pris ${Ore.format(Ore.round(signal.typicalUnitPrice))}`}
    />
  );
}

/** The fields that only the expanded editor shows: product link, discount target, and line details. */
function ExpandedLineFields({
  line,
  lines,
  receiptId,
  retailer,
  productChoice,
  productOpen,
  details,
  patch,
  onToggleProduct,
  onToggleDetails,
  onProduct,
}: Readonly<{
  line: ReceiptLine;
  lines: ReceiptLine[];
  receiptId: Id<"receipts">;
  retailer: string;
  productChoice?: ProductChoice;
  productOpen: boolean;
  details: boolean;
  patch: (value: Partial<ReceiptLine>) => void;
  onToggleProduct: () => void;
  onToggleDetails: () => void;
  onProduct: (choice: ProductChoice) => void;
}>) {
  return (
    <>
      {line.kind === "product" && (
        <>
          <Button
            title={
              productChoice ? "Produktkobling endret" : "Endre produktkobling"
            }
            variant="secondary"
            compact
            onPress={onToggleProduct}
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
                  patch({ tags: parseTags(event.nativeEvent.text) })
                }
              />
            </>
          )}
        </>
      )}
      {line.kind === "item_discount" && (
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
      <Row
        title={details ? "Skjul flere detaljer" : "Flere detaljer"}
        onPress={onToggleDetails}
      />
      {details && (
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
              categoryId: kind === "product" ? unclearCategoryId : null,
              issues: line.issues.filter(
                (issue) => !isCategoryUncertain(issue),
              ),
            })
          }
        />
      )}
    </>
  );
}

function parseTags(text: string): string[] {
  return text
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
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
