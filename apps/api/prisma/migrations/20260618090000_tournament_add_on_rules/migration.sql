ALTER TABLE "Tournament"
ADD COLUMN "addOnChips" INTEGER NOT NULL DEFAULT 0;

UPDATE "Tournament"
SET
  "addOnEnabled" = TRUE,
  "addOnPrice" = 1000,
  "addOnChips" = 100000
WHERE title IN (
  'Flop Classic',
  'Flop Deep Stack',
  'Flop Butterfly',
  'Flop Old Fashion',
  'Flop Prime Event',
  'Flop Black Edition',
  'Flop Grand Final',
  'Flop Last Call',
  'Flop Secret Final'
);

UPDATE "Tournament"
SET
  "addOnEnabled" = TRUE,
  "addOnPrice" = 1000,
  "addOnChips" = 60000
WHERE title IN (
  'Flop Rampage',
  'Flop Bounty',
  'Flop Mystery Knockout'
);

UPDATE "Tournament"
SET
  "addOnEnabled" = FALSE,
  "addOnPrice" = 0,
  "addOnChips" = 0
WHERE title IN (
  'Flop Freeze Out',
  'Flop One Shot',
  'Flop Phoenix',
  'Flop Chip Leader'
);
