import ExcelJS from "exceljs";
import { RegistrationStatus } from "@prisma/client";
import { prisma } from "../prisma.js";

const BARNAUL_OFFSET = "+07:00";

function toDateKey(value: Date) {
  return new Date(value.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function parseGameDay(value: unknown) {
  const fallback = toDateKey(new Date());
  const dateKey = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
  const start = new Date(`${dateKey}T00:00:00${BARNAUL_OFFSET}`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { dateKey, start, end };
}

export async function buildGameDayRatingWorkbook(dateInput: unknown) {
  const day = parseGameDay(dateInput);
  const tournaments = await prisma.tournament.findMany({
    where: {
      startsAt: {
        gte: day.start,
        lt: day.end
      }
    },
    include: {
      registrations: {
        where: { status: RegistrationStatus.ACTIVE },
        include: { user: true },
        orderBy: [{ finishPlace: "asc" }, { createdAt: "asc" }]
      },
      ratingResults: { include: { user: true }, orderBy: { place: "asc" } },
      knockouts: {
        include: {
          killerRegistration: { include: { user: true } },
          eliminatedRegistration: { include: { user: true } }
        }
      }
    },
    orderBy: { startsAt: "asc" }
  });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Flop Club";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Игровой день", {
    views: [{ state: "frozen", ySplit: 1 }]
  });

  sheet.columns = [
    { header: "Дата", key: "date", width: 14 },
    { header: "Турнир", key: "tournament", width: 26 },
    { header: "Место", key: "place", width: 10 },
    { header: "Игрок", key: "player", width: 24 },
    { header: "Username", key: "username", width: 18 },
    { header: "Telegram ID", key: "telegramId", width: 18 },
    { header: "Статус", key: "status", width: 12 },
    { header: "Стол", key: "table", width: 8 },
    { header: "Бокс", key: "seat", width: 8 },
    { header: "Вход", key: "entry", width: 8 },
    { header: "Вылет", key: "eliminatedAt", width: 20 },
    { header: "Нокауты", key: "knockouts", width: 10 },
    { header: "Очки рейтинга", key: "ratingPoints", width: 16 }
  ];

  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFB41028" } };
  header.alignment = { vertical: "middle", horizontal: "center" };
  header.height = 24;

  for (const tournament of tournaments) {
    const ratingByUser = new Map(tournament.ratingResults.map((result) => [result.userId, result.points]));
    const knockoutsByUser = new Map<string, number>();
    for (const knockout of tournament.knockouts) {
      const userId = knockout.killerRegistration?.userId;
      if (userId) knockoutsByUser.set(userId, (knockoutsByUser.get(userId) ?? 0) + 1);
    }

    for (const registration of tournament.registrations) {
      const user = registration.user;
      const player =
        user.displayName || [user.firstName, user.lastName].filter(Boolean).join(" ") || user.username || user.telegramId;

      sheet.addRow({
        date: day.dateKey,
        tournament: tournament.title,
        place: registration.finishPlace ?? "",
        player,
        username: user.username ? `@${user.username}` : "",
        telegramId: user.telegramId,
        status: registration.liveStatus === "ELIMINATED" ? "Выбыл" : "В игре",
        table: registration.tableNumber ?? "",
        seat: registration.seatNumber ?? "",
        entry: registration.entryNumber,
        eliminatedAt: registration.eliminatedAt ? registration.eliminatedAt.toISOString().replace("T", " ").slice(0, 16) : "",
        knockouts: knockoutsByUser.get(user.id) ?? 0,
        ratingPoints: ratingByUser.get(user.id) ?? 0
      });
    }
  }

  if (!tournaments.length) {
    sheet.addRow({
      date: day.dateKey,
      tournament: "Турниров за этот игровой день нет"
    });
  }

  sheet.eachRow((row) => {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FF2A2F38" } },
        bottom: { style: "thin", color: { argb: "FF2A2F38" } }
      };
      cell.alignment = { vertical: "middle" };
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return {
    dateKey: day.dateKey,
    buffer: Buffer.from(buffer)
  };
}
