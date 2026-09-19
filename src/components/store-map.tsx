import type { StoreLocation } from "@/lib/domain/store-spending";

export type StoreMapPoint = {
  id: string;
  name: string;
  location: StoreLocation;
  amountOre: number;
};

export type StoreMapProps = {
  stores: StoreMapPoint[];
  onSelect: (id: string) => void;
};

/** The store list is available on platforms without a configured map provider. */
export function StoreMap(_props: StoreMapProps) {
  return null;
}
