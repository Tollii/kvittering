import type { ReactNode } from "react";
import type { Id } from "../../convex/_generated/dataModel";

export type ReceiptContextMenuProps = Readonly<{
  receiptId: Id<"receipts">;
  store: string;
  amount: string;
  date: string;
  children: ReactNode;
}>;

export function ReceiptContextMenu({ children }: ReceiptContextMenuProps) {
  return children;
}
