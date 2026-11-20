-- Mystery Knockout card points are entered when a participant is eliminated and
-- later synchronized into rating events when the tournament results are saved.
ALTER TABLE "Registration"
ADD COLUMN "mysteryCardPoints" INTEGER NOT NULL DEFAULT 0;
