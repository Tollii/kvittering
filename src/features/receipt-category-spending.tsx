import { useState } from "react";
import { View } from "react-native";
import { SpendingBars } from "@/components/spending-details";
import {
  Amount,
  Button,
  Copy,
  List,
  Notice,
  Row,
  SectionTitle,
  Sheet,
} from "@/components/ui";
import { receiptCategorySpending } from "@/lib/domain/receipt-category-spending";
import { Ore } from "@/lib/domain/ore";
import { reconcile, type ReceiptData } from "@/lib/domain/receipt";

export function ReceiptCategorySpending({
  data,
}: Readonly<{ data: ReceiptData }>) {
  const [showAll, setShowAll] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const groups = receiptCategorySpending(data);
  const selected = groups.find((group) => group.id === selectedId);
  const totals = reconcile(data);

  const hasOpposingSigns =
    groups.some((group) => group.amountOre > 0) &&
    groups.some((group) => group.amountOre < 0);

  if (!groups.length) return null;

  return (
    <View style={{ gap: 4 }}>
      <SectionTitle title="Kategorier" />
      {data.currency !== "NOK" ? (
        <Notice>Kategorifordeling vises bare for kvitteringer i NOK.</Notice>
      ) : (
        <>
          <Copy role="detail" muted>
            Etter rabatt, uten pant og pantretur.
          </Copy>
          {totals.unknown > 0 && (
            <Notice tone="warning">
              Beløp mangler på noen linjer. Summene er ufullstendige.
            </Notice>
          )}
          <SpendingBars
            rows={showAll ? groups : groups.slice(0, 5)}
            total={hasOpposingSigns ? undefined : totals.productSpending}
            onSelect={(group) => setSelectedId(group.id)}
          />
          {groups.length > 5 && (
            <Button
              title={showAll ? "Vis færre" : `Vis alle ${groups.length}`}
              variant="secondary"
              compact
              onPress={() => setShowAll(!showAll)}
            />
          )}
          <Sheet
            title={selected?.name ?? ""}
            visible={!!selected}
            onClose={() => setSelectedId(null)}
          >
            {selected && (
              <>
                <Amount
                  testID="receipt-category-total"
                  detail="Etter rabatt, uten pant og pantretur."
                >
                  {Ore.format(selected.amountOre)}
                </Amount>
                {totals.unknown > 0 && (
                  <Notice tone="warning">
                    Beløp mangler på noen linjer. Summene er ufullstendige.
                  </Notice>
                )}
                <List>
                  {selected.items.map((item) => (
                    <Row
                      key={item.id}
                      title={item.name}
                      value={Ore.format(item.amountOre)}
                    />
                  ))}
                </List>
              </>
            )}
          </Sheet>
        </>
      )}
    </View>
  );
}
