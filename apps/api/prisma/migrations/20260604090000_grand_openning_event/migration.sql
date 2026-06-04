UPDATE "Tournament"
SET
  "id" = '2026-06-05-flop-grand-openning',
  "title" = 'FLOP GRAND OPENNING',
  "description" = 'Официальное открытие Flop Club в Барнауле.',
  "buyIn" = 0,
  "reEntry" = 0,
  "prizePool" = 0,
  "ratingPool" = 0,
  "profile" = 'BASE',
  "addOnEnabled" = false,
  "addOnPrice" = 0,
  "updatedAt" = now()
WHERE "id" = '2026-06-05-flop-prime-event'
  OR ("startsAt" >= '2026-06-04 17:00:00+00' AND "startsAt" < '2026-06-05 17:00:00+00');
