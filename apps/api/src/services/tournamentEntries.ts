// A marked re-entry bumps entryNumber on the same row, a self-service one adds a row that carries
// the next number, so a player's entries are their highest entryNumber rather than a row count.
export function entriesByUser(registrations: { userId: string; entryNumber: number }[]) {
  const entries = new Map<string, number>();
  for (const registration of registrations) {
    entries.set(registration.userId, Math.max(entries.get(registration.userId) ?? 0, registration.entryNumber));
  }
  return entries;
}
