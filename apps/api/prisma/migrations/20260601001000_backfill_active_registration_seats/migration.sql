WITH ordered AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (PARTITION BY "tournamentId" ORDER BY "createdAt", "id") AS rn
  FROM "Registration"
  WHERE "status" = 'ACTIVE'
    AND ("tableNumber" IS NULL OR "seatNumber" IS NULL)
)
UPDATE "Registration" AS registration
SET
  "tableNumber" = FLOOR((ordered.rn - 1) / 10)::INTEGER + 1,
  "seatNumber" = ((ordered.rn - 1) % 10)::INTEGER + 1
FROM ordered
WHERE registration."id" = ordered."id"
  AND ordered.rn <= 50;
