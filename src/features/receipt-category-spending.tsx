import { useState } from "react";
import { View } from "react-native";
import { SpendingBars } from "@/components/spending-details";
import { Copy, Notice, Panel, Row, SectionTitle, Sheet } from "@/components/ui";
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

  if (!groups.length) return null;

  return (
    <View style={{ gap: 4 }}>
      <SectionTitle title="Kategorier" />
      {data.currency !== "NOK" ? (
        <Notice>Kategorifordeling vises bare for kvitteringer i NOK.</Notice>
      ) : (
        <>
          <Copy size={13} muted>
            Etter rabatt, uten pant og pantretur.
          </Copy>
          {totals.unknown > 0 && (
            <Notice tone="warning">
              Beløp mangler på noen linjer. Summene er ufullstendige.
            </Notice>
          )}
          <SpendingBars
            rows={showAll ? groups : groups.slice(0, 5)}
            total={totals.productSpending}
            onSelect={(group) => setSelectedId(group.id)}
          />
          {groups.length > 5 && (
            <Row
              title={showAll ? "Vis færre" : `Vis alle ${groups.length}`}
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
                <Copy size={34} weight="800">
                  {Ore.format(selected.amountOre)}
                </Copy>
                <Copy size={13} muted>
                  Etter rabatt, uten pant og pantretur.
                </Copy>
                {totals.unknown > 0 && (
                  <Notice tone="warning">
                    Beløp mangler på noen linjer. Summene er ufullstendige.
                  </Notice>
                )}
                <Panel style={{ gap: 0, paddingVertical: 4 }}>
                  {selected.items.map((item) => (
                    <Row
                      key={item.id}
                      title={item.name}
                      value={Ore.format(item.amountOre)}
                    />
                  ))}
                </Panel>
              </>
            )}
          </Sheet>
        </>
      )}
    </View>
  );
}
