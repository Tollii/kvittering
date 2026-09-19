import { useState } from "react";
import { Copy, Segments, Row } from "@/components/ui";
import { formatPurchaseQuantity } from "@/lib/domain/family-insights";
import { formatMoney } from "@/lib/domain/receipt";
import {
  attributeInsights,
  type AttributeDimension,
} from "@/lib/domain/attribute-insights";
import type { Receipt, SpendingGroup } from "@/lib/domain/insights";

export function ProductAttributesReport({
  receipts,
  onSelect,
}: Readonly<{
  receipts: Receipt[];
  onSelect: (value: SpendingGroup, dimension: AttributeDimension) => void;
}>) {
  const [dimension, setDimension] = useState<AttributeDimension>("type");
  const report = attributeInsights(receipts, dimension);

  return (
    <>
      <Segments
        value={dimension}
        onChange={setDimension}
        options={[
          { value: "type", label: "Produkttype" },
          { value: "sugar", label: "Sukker" },
          { value: "preparation", label: "Tilberedning" },
        ]}
      />
      <Copy muted size={13}>
        {report.known} av {report.total} varer har tilstrekkelig informasjon.
        Basert på kvittering og tilgjengelige katalogopplysninger.
      </Copy>
      {report.groups.map((row) => (
        <Row
          key={row.id}
          title={row.name}
          detail={`${formatPurchaseQuantity(row.quantity)} · ${row.contributions.length} varelinjer`}
          value={formatMoney(row.amountOre)}
          onPress={() => onSelect(row, dimension)}
        />
      ))}
      <Copy muted size={12}>
        Mengdene summerer bare kjente verdier og kan være ufullstendige. De
        gjelder hele produkter, ikke vekten av enkelte ingredienser.
      </Copy>
      <Copy muted size={12}>
        Sukkervariant er en produktegenskap, ikke en helsevurdering. Ukjente
        egenskaper er ikke gjettet.
      </Copy>
    </>
  );
}
