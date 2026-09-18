import { useState } from "react";
import { Copy, Field, Loading, Notice, Row, Sheet } from "@/components/ui";
import { useCatalogSearch } from "./catalog-queries";
import type { PhysicalStore } from "@/lib/catalog/model";
import type { Id } from "../../convex/_generated/dataModel";
export function CatalogStorePicker({
  receiptId,
  name,
  onSelect,
  onClose,
}: {
  receiptId: Id<"receipts">;
  name: string;
  onSelect: (store: PhysicalStore | null) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState(name);
  const query = useCatalogSearch(search, receiptId);
  return (
    <Sheet
      title="Velg butikk"
      visible
      onClose={onClose}
      header={
        <Field
          label="Butikknavn eller sted"
          value={search}
          onChangeText={setSearch}
          autoCorrect={false}
        />
      }
    >
      {((query.isFetching && !query.data) ||
        query.data?.status === "pending") && (
        <Loading title="Henter butikker …" />
      )}
      {(query.isError || query.data?.status === "error") && (
        <Notice>
          {query.data?.message ?? "Butikkene kunne ikke hentes nå."}
        </Notice>
      )}
      {query.data?.stores.map((store) => (
        <Row
          key={store.id}
          title={store.name}
          detail={store.address}
          onPress={() => {
            onSelect(store);
            onClose();
          }}
        />
      ))}
      {query.data?.status === "ready" && !query.data.stores.length && (
        <Copy muted>Ingen butikker funnet. Prøv stedsnavnet.</Copy>
      )}
      <Row
        title="Behold uten butikkkobling"
        onPress={() => {
          onSelect(null);
          onClose();
        }}
      />
      <Copy size={12} muted>
        Butikkdata fra Kassalapp.
      </Copy>
    </Sheet>
  );
}
