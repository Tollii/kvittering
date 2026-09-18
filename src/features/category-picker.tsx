import { useState } from "react";
import { Pressable, View } from "react-native";
import { Copy, Field, Icon, Panel, Row, Sheet, Toggle } from "@/components/ui";
import {
  categories,
  categoryById,
  categoryGroups,
} from "@/lib/domain/categories";
import { useTheme } from "@/constants/theme";

// Common receipt words make category search useful without knowing the taxonomy.
const keywords: Record<string, string> = {
  "personal-care.oral": "tannbørste tannkrem tanntråd munnskyll jordan colgate",
  "convenience.frozen-pizza": "pizza bigone grandiosa",
  "household.laundry": "vaskemiddel skyllemiddel omo blenda",
  "household.dishwashing": "zalo oppvaskmiddel oppvasktabletter",
  "other-purchases.bags": "bærepose pose",
  "drinks.energy-drinks": "battery monster red bull",
  "drinks.soft-drinks": "cola pepsi solo fanta",
};

export function CategoryPicker({
  name,
  value,
  recent,
  remember,
  onRemember,
  onSelect,
  onClose,
}: {
  name: string;
  value: string | null;
  recent: string[];
  remember: boolean;
  onRemember: (value: boolean) => void;
  onSelect: (value: string) => void;
  onClose: () => void;
}) {
  const colors = useTheme();
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState<string | null>(null);
  const query = search.trim().toLocaleLowerCase("nb-NO");
  const current = categoryById.get(value ?? "");
  const results = categories.filter((category) =>
    query
      ? `${category.groupName} ${category.name} ${keywords[category.id] ?? ""}`
          .toLocaleLowerCase("nb-NO")
          .includes(query)
      : category.group === group,
  );
  const recentCategories = [...new Set(recent)]
    .filter((id) => id !== value && !id.startsWith("fallback."))
    .slice(0, 4);
  const choose = (id: string) => {
    onSelect(id);
    onClose();
  };
  const categoryRow = (id: string, showGroup = false) => {
    const category = categoryById.get(id);
    if (!category) return null;
    return (
      <Row
        key={id}
        title={category.name}
        detail={showGroup ? category.groupName : undefined}
        value={id === value ? "✓" : undefined}
        onPress={() => choose(id)}
      />
    );
  };
  return (
    <Sheet
      title="Velg kategori"
      visible
      onClose={onClose}
      header={
        <>
          <Copy weight="600">{name}</Copy>
          <Field
            label="Søk etter kategori eller vare"
            placeholder="F.eks. tannbørste, pizza eller frukt"
            value={search}
            onChangeText={setSearch}
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
        </>
      }
      footer={
        <>
          <Toggle
            label="Husk for samme vare"
            value={remember}
            onChange={onRemember}
          />
          <Copy size={12} muted>
            Gjelder fremtidige kjøp i samme butikk når du lagrer kvitteringen.
          </Copy>
        </>
      }
    >
      {query || group ? (
        <>
          {!query && (
            <Row title="Alle kategorier" onPress={() => setGroup(null)} />
          )}
          <Copy size={13} weight="600" muted>
            {query
              ? `${results.length} treff`
              : categoryGroups.find(([id]) => id === group)?.[1]}
          </Copy>
          <Panel style={{ gap: 2 }}>
            {results.map((category) => categoryRow(category.id, !!query))}
            {!results.length && (
              <Copy muted>Ingen treff. Prøv et annet ord.</Copy>
            )}
          </Panel>
        </>
      ) : (
        <>
          {current && (
            <>
              <Copy size={13} muted>
                Valgt nå · trykk for å bekrefte
              </Copy>
              <Panel>{categoryRow(current.id, true)}</Panel>
            </>
          )}
          {recentCategories.length > 0 && (
            <>
              <Copy size={13} muted>
                Brukt på kvitteringene dine
              </Copy>
              <Panel style={{ gap: 2 }}>
                {recentCategories.map((id) => categoryRow(id, true))}
              </Panel>
            </>
          )}
          <Copy size={13} weight="600" muted>
            Alle kategorier
          </Copy>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {categoryGroups.map(([id, label]) => (
              <Pressable
                key={id}
                accessibilityRole="button"
                accessibilityLabel={label}
                onPress={() => setGroup(id)}
                style={({ pressed }) => ({
                  width: "48%",
                  flexGrow: 1,
                  minHeight: 58,
                  padding: 12,
                  borderRadius: 12,
                  backgroundColor: colors.surface,
                  opacity: pressed ? 0.6 : 1,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                })}
              >
                <Copy size={15} weight="600" style={{ flex: 1 }}>
                  {label}
                </Copy>
                <Icon name="chevron.right" size={12} />
              </Pressable>
            ))}
          </View>
        </>
      )}
    </Sheet>
  );
}
