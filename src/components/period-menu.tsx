import { Copy } from "./ui";
import { useTheme } from "@/constants/theme";

export function PeriodMenu({
  value,
}: Readonly<{
  value: string;
  latest: string;
  onChange: (month: string) => void;
}>) {
  const colors = useTheme();

  const label = new Intl.DateTimeFormat("nb-NO", {
    month: "long",
    year: "numeric",
  }).format(new Date(`${value}-01T12:00:00Z`));

  return (
    <Copy size={22} weight="600" style={{ color: colors.onHero, flex: 1 }}>
      {label}
    </Copy>
  );
}
