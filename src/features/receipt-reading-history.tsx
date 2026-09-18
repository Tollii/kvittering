import { useState } from "react";
import { Button, Copy, Panel, Row, Sheet } from "@/components/ui";
import type { Doc } from "../../convex/_generated/dataModel";
import { formatMoney, reconcile } from "@/lib/domain/receipt";
import { categoryById } from "@/lib/domain/categories";

export function ReceiptReadingHistory({
  readings,
}: {
  readings: Doc<"extractions">[];
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const reading = readings.find((item) => item._id === selected);
  const data = reading?.classifiedData ?? reading?.data;
  return (
    <>
      <Row
        title="Sammenlign lesinger"
        detail={`${readings.length} lagrede resultater`}
        icon="clock.arrow.circlepath"
        onPress={() => setOpen(true)}
      />
      <Sheet
        title="Lagrede lesinger"
        visible={open}
        onClose={() => {
          setOpen(false);
          setSelected(null);
        }}
      >
        {!reading
          ? readings.map((item) => (
              <Row
                key={item._id}
                title={item.provider}
                detail={`${new Date(item._creationTime).toLocaleString("nb-NO")} · ${item.data.lines.filter((line) => line.kind === "product").length} varer${item.durationMs !== undefined ? ` · ${(item.durationMs / 1000).toFixed(1)} s` : ""}`}
                value={formatMoney(item.data.totalOre)}
                onPress={() => setSelected(item._id)}
              />
            ))
          : data && (
              <>
                <Button
                  title="Alle lesinger"
                  secondary
                  onPress={() => setSelected(null)}
                />
                <Copy weight="600">{reading.provider}</Copy>
                <Row
                  title={data.store ?? "Ukjent butikk"}
                  detail={data.purchaseDate ?? "Ukjent dato"}
                  value={formatMoney(data.totalOre)}
                />
                <Row
                  title="Avvik mot trykt total"
                  value={formatMoney(reconcile(data).difference)}
                />
                {data.issues.map((issue, index) => (
                  <Copy key={index}>{issue}</Copy>
                ))}
                <Panel style={{ gap: 0 }}>
                  {data.lines.map((line) => (
                    <Row
                      key={line.id}
                      title={line.name || line.originalText}
                      detail={[
                        categoryById.get(line.categoryId ?? "")?.name,
                        ...line.issues,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                      value={formatMoney(line.amountOre)}
                    />
                  ))}
                </Panel>
                <Copy weight="600">Lest tekst</Copy>
                <Copy selectable size={13}>
                  {data.originalText}
                </Copy>
              </>
            )}
      </Sheet>
    </>
  );
}
