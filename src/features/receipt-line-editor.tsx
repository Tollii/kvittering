import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  Button,
  Copy,
  Field,
  Notice,
  Panel,
  Row,
  Select,
  Toggle,
} from "@/components/ui";
import { MoneyField } from "@/components/money-field";
import { categories, categoryById } from "@/lib/domain/categories";
import { lineKinds, formatMoney, type ReceiptLine } from "@/lib/domain/receipt";
import { lineReviewIssues } from "@/lib/domain/receipt-review";

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
  | { kind: "separate" };
type Props = {
  line: ReceiptLine;
  lines: ReceiptLine[];
  receiptId: Id<"receipts">;
  retailer: string;
  remember: boolean;
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
  productChoice,
  onChange,
  onRemember,
  onProduct,
  onRemove,
  onMoneyError,
}: Props) {
  const [expanded, setExpanded] = useState(lineReviewIssues(line).length > 0);
  const [productOpen, setProductOpen] = useState(false);
  const [details, setDetails] = useState(false);
  const patch = (value: Partial<ReceiptLine>) =>
    onChange({ ...line, ...value, manual: true });
  return (
    <Panel>
      <Row
        title={line.name || "Ny vare"}
        detail={`${lineLabels[line.kind]}${line.kind === "product" ? ` · ${categoryById.get(line.categoryId ?? "")?.name ?? "Uavklart"}` : ""}${lineReviewIssues(line).length ? " · Må kontrolleres" : ""}`}
        value={formatMoney(line.amountOre)}
        onPress={() => setExpanded(!expanded)}
      />
      {expanded && (
        <>
          <Copy muted size={13}>
            Original: {line.originalText || "Manuelt lagt til"}
          </Copy>
          <Field
            label="Navn"
            value={line.name}
            onChangeText={(name) => patch({ name })}
          />
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
              })
            }
          />
          <MoneyField
            label="Linjesum (kr)"
            value={line.amountOre}
            onChange={(amountOre) => patch({ amountOre })}
            onError={onMoneyError}
          />
          {line.kind === "product" && (
            <>
              <Select
                label="Kategori"
                value={line.categoryId}
                options={categories.map((category) => ({
                  value: category.id,
                  label: `${category.groupName} · ${category.name}`,
                }))}
                onChange={(categoryId) => patch({ categoryId })}
              />
              <Toggle
                label="Husk kategori for samme vare i denne butikken"
                value={remember}
                onChange={onRemember}
              />
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
              <Button
                title="Andre detaljer"
                secondary
                onPress={() => setDetails(!details)}
              />
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
          {lineReviewIssues(line).length > 0 && (
            <>
              <Notice>{lineReviewIssues(line).join("\n")}</Notice>
              {line.issues.length > 0 && (
                <Button
                  title="Linjen er kontrollert"
                  secondary
                  onPress={() => patch({ issues: [] })}
                />
              )}
            </>
          )}
          <Button title="Fjern linje" danger onPress={onRemove} />
        </>
      )}
    </Panel>
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
