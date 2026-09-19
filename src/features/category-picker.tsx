import { useState } from "react";
import { Pressable, View } from "react-native";
import {
  Copy,
  Field,
  Icon,
  Panel,
  Row,
  Sheet,
  Toggle,
  pressed,
} from "@/components/ui";
import {
  categories,
  categoryById,
  categoryGroups,
} from "@/lib/domain/categories";
import { useTheme } from "@/constants/theme";

// Common receipt words make category search useful without knowing the taxonomy.
const keywords = new Map(
  Object.entries({
    "personal-care.oral":
      "tannbørste tannkrem tanntråd munnskyll jordan colgate",
    "convenience.frozen-pizza": "pizza bigone grandiosa",
    "household.laundry": "vaskemiddel skyllemiddel omo blenda",
    "household.dishwashing": "zalo oppvaskmiddel oppvasktabletter",
    "other-purchases.bags": "bærepose pose",
    "drinks.soft-drinks":
      "cola pepsi solo fanta energidrikk battery monster red bull burn",
    "convenience.fresh-meals": "pizza varmmat ferdigmat fersk",
    "convenience.sandwiches": "tacobaguette baguett sandwich wrap",
    "personal-care.supplements":
      "vitamin melatonin kosttilskudd tran mineral magnesium",
  }),
);

export function CategoryPicker({
  name,
  value,
  confidence,
  originalText,
  brand,
  recent,
  remember,
  onRemember,
  onSelect,
  onClose,
}: {
  name: string;
  value: string | null;
  /** The reader's confidence in the current suggestion, 0–1. */
  confidence?: number | null;
  /** The raw receipt text the suggestion was based on. */
  originalText?: string;
  brand?: string | null;
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
      ? `${category.groupName} ${category.name} ${keywords.get(category.id) ?? ""}`
          .toLocaleLowerCase("nb-NO")
          .includes(query)
      : category.group === group,
  );

  // Most-used first: the household's own habits are the best predictor.
  const usage = new Map<string, number>();

  for (const id of recent) usage.set(id, (usage.get(id) ?? 0) + 1);

  const recentCategories = [...usage.entries()]
    .filter(([id]) => id !== value && !id.startsWith("fallback."))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([id]) => id);

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
        selected={id === value}
        onPress={() => choose(id)}
      />
    );
  };

  const list = (ids: string[], showGroup: boolean) => (
    <Panel style={{ gap: 0, paddingVertical: 4 }}>
      {ids.map((id, index) => (
        <View
          key={id}
          style={{
            borderTopWidth: index ? 1 : 0,
            borderTopColor: colors.line,
          }}
        >
          {categoryRow(id, showGroup)}
        </View>
      ))}
    </Panel>
  );

  return (
    <Sheet
      title="Velg kategori"
      visible
      onClose={onClose}
      header={
        <>
          <Copy size={15} weight="600" numberOfLines={2}>
            {name}
          </Copy>
          {(originalText || brand || confidence != null) && (
            <Copy size={12} muted numberOfLines={2}>
              {[
                originalText && originalText !== name
                  ? `Lest: ${originalText}`
                  : null,
                brand,
                confidence != null && confidence < 1
                  ? `${Math.round(confidence * 100)} % sikker`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </Copy>
          )}
          <Field
            label="Søk etter kategori eller vare"
            placeholder="F.eks. tannbørste, pizza eller frukt"
            value={search}
            onChangeText={(text) => {
              setSearch(text);

              if (text) setGroup(null);
            }}
            autoCorrect={false}
            autoFocus={!current || current.id === "fallback.unclear"}
            clearButtonMode="while-editing"
          />
        </>
      }
      footer={
        <Toggle
          label="Husk for samme vare i butikken"
          value={remember}
          onChange={onRemember}
        />
      }
    >
      {query || group ? (
        <>
          {!query && (
            <Pressable
              accessibilityRole="button"
              onPress={() => setGroup(null)}
              style={(state) => [
                {
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  minHeight: 36,
                },
                pressed(state),
              ]}
            >
              <Icon name="chevron.left" size={12} />
              <Copy size={14} weight="600" style={{ color: colors.primary }}>
                Alle kategorier
              </Copy>
            </Pressable>
          )}
          <Copy size={13} weight="600" muted>
            {query
              ? `${results.length} treff`
              : categoryGroups.find(([id]) => id === group)?.[1]}
          </Copy>
          {results.length ? (
            list(
              results.map((category) => category.id),
              !!query,
            )
          ) : (
            <Copy muted>Ingen treff</Copy>
          )}
        </>
      ) : (
        <>
          {current && current.id !== "fallback.unclear" && (
            <>
              <Copy size={13} weight="600" muted>
                {confidence != null && confidence < 1
                  ? `Forslag · ${Math.round(confidence * 100)} %`
                  : "Valgt"}
              </Copy>
              {list([current.id], true)}
            </>
          )}
          {recentCategories.length > 0 && (
            <>
              <Copy size={13} weight="600" muted>
                Ofte brukt
              </Copy>
              {list(recentCategories, true)}
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
                style={(state) => [
                  {
                    width: "48%",
                    flexGrow: 1,
                    minHeight: 54,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    borderRadius: 14,
                    borderCurve: "continuous",
                    backgroundColor: colors.surface,
                    borderWidth: 1,
                    borderColor: colors.line,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                  },
                  pressed(state),
                ]}
              >
                <Copy size={15} weight="600" style={{ flex: 1 }}>
                  {label}
                </Copy>
                <Icon name="chevron.right" size={11} color={colors.secondary} />
              </Pressable>
            ))}
          </View>
        </>
      )}
    </Sheet>
  );
}
