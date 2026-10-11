import { useState } from "react";
import {
  Copy,
  Empty,
  Field,
  List,
  Row,
  SectionTitle,
  Sheet,
  Toggle,
} from "@/components/ui";
import {
  categories,
  category,
  categoryGroups,
  isDecidedCategory,
  parseCategoryId,
  type CategoryId,
} from "@/lib/domain/categories";

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

// Most-used first: the household's own habits are the best predictor.
function mostUsedCategories(
  recent: string[],
  currentId: CategoryId | null,
): CategoryId[] {
  const usage = new Map<CategoryId, number>();

  for (const id of recent.map(parseCategoryId))
    if (id && category(id).group !== "fallback")
      usage.set(id, (usage.get(id) ?? 0) + 1);

  return [...usage.entries()]
    .filter(([id]) => id !== currentId)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([id]) => id);
}

/** Describes the receipt text, brand, and confidence behind a suggestion. */
function suggestionSource({
  name,
  originalText,
  brand,
  confidence,
}: Readonly<{
  name: string;
  originalText?: string;
  brand?: string | null;
  confidence?: number | null;
}>): string {
  return [
    originalText && originalText !== name ? `Lest: ${originalText}` : null,
    brand,
    confidence != null && confidence < 1
      ? `${Math.round(confidence * 100)} % sikker`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

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
}: Readonly<{
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
  onSelect: (value: CategoryId) => void;
  onClose: () => void;
}>) {
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState<string | null>(null);
  const query = search.trim().toLocaleLowerCase("nb-NO");
  const currentId = parseCategoryId(value);

  const results = categories.filter((category) =>
    query
      ? `${category.groupName} ${category.name} ${keywords.get(category.id) ?? ""}`
          .toLocaleLowerCase("nb-NO")
          .includes(query)
      : category.group === group,
  );

  const recentCategories = mostUsedCategories(recent, currentId);

  const choose = (id: CategoryId) => {
    onSelect(id);
    onClose();
  };

  const categoryRow = (id: CategoryId, showGroup = false) => {
    const { name, groupName } = category(id);

    return (
      <Row
        key={id}
        title={name}
        detail={showGroup ? groupName : undefined}
        selected={id === currentId}
        onPress={() => choose(id)}
      />
    );
  };

  const list = (ids: CategoryId[], showGroup: boolean) => (
    <List>{ids.map((id) => categoryRow(id, showGroup))}</List>
  );

  const groupName = categoryGroups.find(([id]) => id === group)?.[1];

  if (group && !groupName) throw new Error("Velg en kjent kategorigruppe.");

  return (
    <Sheet
      title="Velg kategori"
      visible
      onClose={onClose}
      header={
        <>
          <Copy weight="600" numberOfLines={2}>
            {name}
          </Copy>
          {!!(originalText || brand || confidence != null) && (
            <Copy role="caption" muted numberOfLines={2}>
              {suggestionSource({ name, originalText, brand, confidence })}
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
            autoFocus={!isDecidedCategory(currentId)}
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
          <SectionTitle
            title={groupName ?? `${results.length} treff`}
            action={query ? undefined : "Alle kategorier"}
            onAction={() => setGroup(null)}
          />
          {results.length ? (
            list(
              results.map((category) => category.id),
              !!query,
            )
          ) : (
            <Empty
              title="Ingen treff"
              message="Prøv et annet ord, eller velg en gruppe."
              icon="magnifyingglass"
            />
          )}
        </>
      ) : (
        <>
          {isDecidedCategory(currentId) && (
            <>
              <SectionTitle
                title={
                  confidence != null && confidence < 1
                    ? `Forslag · ${Math.round(confidence * 100)} %`
                    : "Valgt"
                }
              />
              {list([currentId], true)}
            </>
          )}
          {recentCategories.length > 0 && (
            <>
              <SectionTitle title="Ofte brukt" />
              {list(recentCategories, true)}
            </>
          )}
          <SectionTitle title="Alle kategorier" />
          <List>
            {categoryGroups.map(([id, label]) => (
              <Row key={id} title={label} onPress={() => setGroup(id)} />
            ))}
          </List>
        </>
      )}
    </Sheet>
  );
}
