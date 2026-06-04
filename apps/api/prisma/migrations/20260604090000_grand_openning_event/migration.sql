UPDATE "Tournament"
SET
  "id" = '2026-06-05-flop-grand-opening',
  "title" = 'FLOP GRAND OPENING',
  "description" = 'Открытие FLOP CLUB: бесплатный вход, фуршет, атмосфера и первый турнир в истории клуба.',
  "buyIn" = 0,
  "reEntry" = 500,
  "prizePool" = 0,
  "ratingPool" = 0,
  "profile" = 'BASE',
  "addOnEnabled" = false,
  "addOnPrice" = 0,
  "updatedAt" = now()
WHERE "id" = '2026-06-05-flop-prime-event'
  OR "id" = '2026-06-05-flop-grand-openning'
  OR ("startsAt" >= '2026-06-04 17:00:00+00' AND "startsAt" < '2026-06-05 17:00:00+00');
