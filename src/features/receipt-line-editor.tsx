import { useState } from "react";
import { Pressable, View } from "react-native";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  Button,
  Copy,
  Field,
  Icon,
  Notice,
  Panel,
  Row,
  Select,
} from "@/components/ui";
import { MoneyField } from "@/components/money-field";
import { categoryById } from "@/lib/domain/categories";
import { lineKinds, formatMoney, type ReceiptLine } from "@/lib/domain/receipt";
import {
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
export type ProductChoice =
  | { kind: "existing"; id: Id<"products"> }
  | { kind: "new" }
  | { kind: "catalog"; product: CatalogProduct }
  | { kind: "separate" };
type Props = {
  line: ReceiptLine;
  lines: ReceiptLine[];
  receiptId: Id<"receipts">;
  retailer: string;
  remember: boolean;
  recentCategories: string[];
  productChoice?: ProductChoice;
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
  onChange,
  onRemember,
  onProduct,
  onRemove,
  onMoneyError,
}: Props) {
  const colors = useTheme();
  const issues = lineReviewIssues(line);
  const categoryUncertain = line.issues.includes("Kategorien er usikker.");
  const [expanded, setExpanded] = useState(
    !line.name || line.amountOre === null,
  );
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
          productChoice?.kind === "new" ||
          productChoice?.kind === "existing"
        ? null
        : line.catalogProduct;
  const patch = (value: Partial<ReceiptLine>) =>
    onChange({ ...line, ...value, manual: true });
  return (
    <View
      style={{
        borderBottomWidth: 1,
        borderBottomColor: colors.line,
        paddingVertical: 2,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Rediger ${line.name || "ny vare"}, ${formatMoney(line.amountOre)}`}
        accessibilityState={{ expanded }}
        onPress={() => setExpanded(!expanded)}
        style={({ pressed }) => ({
          minHeight: 44,
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          opacity: pressed ? 0.6 : 1,
        })}
      >
        {issues.length > 0 && (
          <Icon
            name="exclamationmark.circle"
            size={16}
            color={colors.warning}
          />
        )}
        <Copy size={15} weight="600" numberOfLines={2} style={{ flex: 1 }}>
          {line.name || "Ny vare"}
        </Copy>
        <Copy size={15} weight="600" style={{ flexShrink: 0 }}>
          {formatMoney(line.amountOre)}
        </Copy>
        <Icon
          name={expanded ? "chevron.up" : "chevron.down"}
          size={12}
          color={colors.secondary}
        />
      </Pressable>
      {line.kind === "product" && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Velg kategori for ${line.name}. Nå: ${categoryById.get(line.categoryId ?? "")?.name ?? "Uavklart"}`}
            onPress={() => setCategoryOpen(true)}
            style={({ pressed }) => ({
              flex: 1,
              minHeight: 44,
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Icon
              name="tag"
              size={14}
              color={categoryUncertain ? colors.warning : colors.secondary}
            />
            <Copy
              size={13}
              numberOfLines={2}
              style={{
                flexShrink: 1,
                color: categoryUncertain ? colors.warning : colors.secondary,
              }}
            >
              {categoryById.get(line.categoryId ?? "")?.name ?? "Velg kategori"}
              {categoryUncertain ? " · usikker" : ""}
            </Copy>
            <Icon name="chevron.down" size={10} color={colors.secondary} />
          </Pressable>
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
            style={({ pressed }) => ({
              minHeight: 44,
              flexDirection: "row",
              alignItems: "center",
              gap: 5,
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Icon
              name={catalogProduct ? "info.circle" : "magnifyingglass"}
              size={15}
            />
            <Copy size={13} weight="500">
              {catalogProduct ? "Produkt" : "Finn produkt"}
            </Copy>
          </Pressable>
        </View>
      )}
      {categoryOpen && (
        <CategoryPicker
          name={line.name}
          value={line.categoryId}
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
          onSelect={(product) =>
            onProduct(
              product ? { kind: "catalog", product } : { kind: "separate" },
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
      {issues
        .filter((issue) => issue !== "Kategorien er usikker.")
        .map((issue) => (
          <Copy key={issue} size={13} style={{ color: colors.warning }}>
            {issue}
          </Copy>
        ))}
      {expanded && (
        <View style={{ gap: 10, paddingVertical: 10 }}>
          <Copy muted size={13}>
            Original: {line.originalText || "Manuelt lagt til"}
          </Copy>
          <Field
            label="Navn"
            value={line.name}
            onChangeText={(name) => patch({ name })}
          />
          <MoneyField
            label="Linjesum (kr)"
            value={line.amountOre}
            onChange={(amountOre) => patch({ amountOre })}
            onError={onMoneyError}
          />
          {line.kind === "product" && (
            <>
              <Button
                title={
                  productChoice
                    ? "Produktkobling endret"
                    : "Endre produktkobling"
                }
                secondary
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
            onPress={() => setDetails(!details)}
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
                  kind: kind as ReceiptLine["kind"],
                  categoryId: kind === "product" ? "fallback.unclear" : null,
                  issues: line.issues.filter(
                    (issue) => issue !== "Kategorien er usikker.",
                  ),
                })
              }
            />
          )}
          {issues.some((issue) => issue !== "Kategorien er usikker.") && (
            <>
              <Notice>
                {issues
                  .filter((issue) => issue !== "Kategorien er usikker.")
                  .join("\n")}
              </Notice>
              {line.issues.some(
                (issue) => issue !== "Kategorien er usikker.",
              ) && (
                <Button
                  title="Bekreft opplysningene"
                  secondary
                  onPress={() =>
                    patch({
                      issues: line.issues.filter(
                        (issue) => issue === "Kategorien er usikker.",
                      ),
                    })
                  }
                />
              )}
            </>
          )}
          {details && <Button title="Fjern linje" danger onPress={onRemove} />}
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
  const products = useQuery(api.products.search, {
    receiptId,
    retailer,
    search,
  });
  return (
    <Panel>
      <Field
        label="Søk etter lagret produkt"
        value={search}
        onChangeText={setSearch}
      />
      <Copy size={13} muted>
        {line.productName || "Ingen sikker produktkobling"}
      </Copy>
      <Button
        title="Opprett eget produkt"
        secondary
        onPress={() => onChange({ kind: "new" })}
      />
      <Button
        title="Hold varen separat"
        secondary
        onPress={() => onChange({ kind: "separate" })}
      />
      {products?.map((product) => (
        <Row
          key={product._id}
          title={product.name}
          value={
            choice?.kind === "existing" && choice.id === product._id
              ? "✓"
              : undefined
          }
          onPress={() => onChange({ kind: "existing", id: product._id })}
        />
      ))}
      <Copy size={12} muted>
        Lagres for denne varen og fremtidige kjøp med samme kvitteringsnavn i
        butikken.
      </Copy>
    </Panel>
  );
}
