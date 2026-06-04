import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { descriptions, generateScheduledTournaments, slug } from "../src/services/tournamentSchedule.js";

const prisma = new PrismaClient();

async function main() {
  const oldSeedIds = [
    "barnaul-deep-night",
    "emerald-bounty",
    "sunday-freezeout",
    ...Object.keys(descriptions).map(slug)
  ];

  await prisma.tournament.deleteMany({
    where: { id: { in: oldSeedIds } }
  });

  const tournaments = generateScheduledTournaments(
    new Date("2026-06-01T00:00:00+07:00"),
    new Date("2026-06-28T23:59:59+07:00")
  );

  for (const tournament of tournaments) {
    await prisma.tournament.upsert({
      where: { id: tournament.id },
      create: tournament,
      update: tournament
    });
  }

  await prisma.user.upsert({
    where: { telegramId: "111111111" },
    create: {
      telegramId: "111111111",
      username: "danlluxx",
      firstName: "Flop",
      lastName: "Admin",
      role: "ADMIN"
    },
    update: { username: "danlluxx", role: "ADMIN" }
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
    console.log("[seed] done");
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
