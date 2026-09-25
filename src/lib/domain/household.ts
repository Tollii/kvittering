export const householdNameLimit = 80;

/** The stored household name, or null when it is empty or too long once trimmed. */
export function householdName(name: string) {
  const trimmed = name.trim();

  return trimmed && trimmed.length <= householdNameLimit ? trimmed : null;
}
