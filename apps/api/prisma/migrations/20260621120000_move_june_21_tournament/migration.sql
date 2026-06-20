UPDATE "Tournament"
SET
  "startsAt" = TIMESTAMP WITH TIME ZONE '2026-06-21 18:00:00+07',
  "lateRegistrationEndsAt" = TIMESTAMP WITH TIME ZONE '2026-06-21 21:00:00+07',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE id = '2026-06-21-flop-deep-stack';
