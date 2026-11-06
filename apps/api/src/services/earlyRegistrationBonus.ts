// Registering before 18:00 Barnaul on the tournament day adds chips to the starting stack. It is
// stored in Registration.issuedChips; Devil Deal keeps its own chip ledger and has no such bonus.
export const EARLY_REGISTRATION_BONUS_CHIPS = 5000;

// Barnaul is UTC+7 without DST.
const BARNAUL_UTC_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DEADLINE_LOCAL_MS = 18 * 60 * 60 * 1000;

export function earlyRegistrationDeadline(startsAt: Date) {
  const localDayStart = Math.floor((startsAt.getTime() + BARNAUL_UTC_OFFSET_MS) / DAY_MS) * DAY_MS;
  return new Date(localDayStart + DEADLINE_LOCAL_MS - BARNAUL_UTC_OFFSET_MS);
}

export function earlyRegistrationBonusFor(
  tournament: { startsAt: Date; mechanics: unknown },
  registeredAt: Date,
  entryNumber: number
) {
  if (tournament.mechanics || entryNumber > 1) return 0;
  return registeredAt < earlyRegistrationDeadline(tournament.startsAt) ? EARLY_REGISTRATION_BONUS_CHIPS : 0;
}
