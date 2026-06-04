UPDATE "Tournament"
SET
  "id" = '2026-06-05-flop-grand-openning',
  "title" = 'FLOP GRAND OPENNING',
  "description" = 'Открытие FLOP CLUB: бесплатный вход, фуршет, атмосфера и первый турнир в истории клуба.',
  "buyIn" = 0,
  "reEntry" = 1000,
  "prizePool" = 0,
  "ratingPool" = 15000,
  "profile" = 'DEEP_SPECIAL',
  "addOnEnabled" = true,
  "addOnPrice" = 1000,
  "updatedAt" = now()
WHERE "id" = '2026-06-05-flop-prime-event'
  OR "id" = '2026-06-05-flop-grand-opening'
  OR ("startsAt" >= '2026-06-04 17:00:00+00' AND "startsAt" < '2026-06-05 17:00:00+00');
