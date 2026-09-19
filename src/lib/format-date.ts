/** Format stored calendar dates without shifting them to another time zone. */
export function formatDate(value: string | null | undefined) {
  if (!value) return "Dato ukjent";
  const date = new Date(`${value}T12:00:00Z`);

  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("nb-NO", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}
