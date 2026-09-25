import { Ore } from "./ore";
import { categoryOf } from "./categories";
import { spendingLines, type ReceiptData } from "./receipt";

type CategorySpending = {
  id: string;
  name: string;
  amountOre: Ore;
  items: { id: string; name: string; amountOre: Ore | null }[];
};

/** Use draft values without the date, status, or exclusion filters of reports. */
export function receiptCategorySpending(data: ReceiptData) {
  const spending = spendingLines(data);
  const groups = new Map<string, CategorySpending>();

  for (const line of spending.products) {
    const category = categoryOf(line.categoryId);
    const id = category.group;

    const group = groups.get(id) ?? {
      id,
      name: category.groupName,
      amountOre: Ore.zero,
      items: [],
    };

    group.amountOre = Ore.add(group.amountOre, line.netOre);
    group.items.push({
      id: `product:${line.id}`,
      name: line.name || "Ukjent vare",
      amountOre: line.amountOre === null ? null : line.netOre,
    });
    groups.set(id, group);
  }

  if (spending.unallocated) {
    const group = groups.get("fallback") ?? {
      id: "fallback",
      name: "Uavklart",
      amountOre: Ore.zero,
      items: [],
    };

    group.amountOre = Ore.add(group.amountOre, spending.unallocated);
    group.items.push({
      id: "unallocated",
      name: "Ufordelte rabatter og justeringer",
      amountOre: spending.unallocated,
    });
    groups.set(group.id, group);
  }

  return [...groups.values()].sort((a, b) =>
    Ore.compare(b.amountOre, a.amountOre),
  );
}
