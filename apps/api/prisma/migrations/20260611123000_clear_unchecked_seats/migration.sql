UPDATE "Registration"
SET "tableNumber" = NULL,
    "seatNumber" = NULL
WHERE "checkedInAt" IS NULL
  AND ("tableNumber" IS NOT NULL OR "seatNumber" IS NOT NULL);
