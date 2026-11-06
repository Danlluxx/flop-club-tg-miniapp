-- Club staff play their first tournament entry for free; revenue analytics counts it as 0.
ALTER TABLE "User" ADD COLUMN "isStaff" BOOLEAN NOT NULL DEFAULT false;
