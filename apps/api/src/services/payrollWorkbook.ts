import ExcelJS from "exceljs";
import JSZip from "jszip";
import { prisma } from "../prisma.js";
import { AppError } from "../utils/errors.js";

const WORKBOOK_KEY = "master";
const SHIFTS_SHEET = "Смены";
const STAFF_SHEET = "Сотрудники";
const FIRST_ROW = 6;
const LAST_ROW = 2005;

export type ShiftInput = {
  workDate: string;
  employeeName: string;
  startTime: string | null;
  endTime: string | null;
  breakHours: number | null;
  manualHours: number | null;
  status: string;
  comment: string | null;
};

export type RosterEntry = { name: string; position: string; status: string };

function escapeXml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function toMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

export function shiftHours(shift: Pick<ShiftInput, "startTime" | "endTime" | "breakHours" | "manualHours">) {
  if (shift.manualHours != null) return shift.manualHours;
  if (!shift.startTime || !shift.endTime) return 0;
  let minutes = toMinutes(shift.endTime) - toMinutes(shift.startTime);
  if (minutes < 0) minutes += 24 * 60;
  return Math.max(0, Math.round((minutes / 60 - (shift.breakHours ?? 0)) * 100) / 100);
}

function excelDate(workDate: string) {
  return Date.UTC(+workDate.slice(0, 4), +workDate.slice(5, 7) - 1, +workDate.slice(8, 10)) / 86_400_000 + 25569;
}

async function sheetPath(zip: JSZip, sheetName: string) {
  const workbookXml = await zip.file("xl/workbook.xml")?.async("string");
  const relsXml = await zip.file("xl/_rels/workbook.xml.rels")?.async("string");
  if (!workbookXml || !relsXml) throw new AppError(400, "Это не файл Excel (.xlsx)", "PAYROLL_BAD_FILE");
  const sheet = [...workbookXml.matchAll(/<sheet\b[^>]*>/g)].map((m) => m[0]).find((tag) => tag.includes(`name="${sheetName}"`));
  const relId = sheet?.match(/r:id="([^"]+)"/)?.[1];
  const target = relId
    ? [...relsXml.matchAll(/<Relationship\b[^>]*>/g)].map((m) => m[0]).find((tag) => tag.includes(`Id="${relId}"`))?.match(/Target="([^"]+)"/)?.[1]
    : undefined;
  if (!target) throw new AppError(400, `В таблице нет листа «${sheetName}»`, "PAYROLL_BAD_FILE");
  return target.startsWith("/") ? target.slice(1) : `xl/${target}`;
}

export async function validateWorkbook(buffer: Buffer) {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    throw new AppError(400, "Это не файл Excel (.xlsx)", "PAYROLL_BAD_FILE");
  }
  await sheetPath(zip, SHIFTS_SHEET);
  await sheetPath(zip, STAFF_SHEET);
}

export async function readRoster(buffer: Buffer): Promise<RosterEntry[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheet = workbook.getWorksheet(STAFF_SHEET);
  if (!sheet) return [];
  const roster: RosterEntry[] = [];
  for (let row = FIRST_ROW; row <= 55; row += 1) {
    const name = String(sheet.getCell(`C${row}`).text ?? "").trim();
    if (!name) continue;
    roster.push({
      name,
      position: String(sheet.getCell(`D${row}`).text ?? "").trim(),
      status: String(sheet.getCell(`J${row}`).text ?? "").trim()
    });
  }
  return roster;
}

function setCell(rowXml: string, column: string, row: number, value: { number: number } | { text: string } | null) {
  const pattern = new RegExp(`<c r="${column}${row}"((?: [^>]*?)?)(?:/>|>.*?</c>)`, "s");
  const match = rowXml.match(pattern);
  if (!match) throw new AppError(500, `В таблице нет ячейки ${column}${row}`, "PAYROLL_BAD_FILE");
  const style = match[1].match(/ s="\d+"/)?.[0] ?? "";
  let cell: string;
  if (value === null) cell = `<c r="${column}${row}"${style}/>`;
  else if ("number" in value) cell = `<c r="${column}${row}"${style}><v>${value.number}</v></c>`;
  else cell = `<c r="${column}${row}"${style} t="inlineStr"><is><t xml:space="preserve">${escapeXml(value.text)}</t></is></c>`;
  return rowXml.replace(pattern, cell);
}

export async function appendShifts(buffer: Buffer, shifts: ShiftInput[]) {
  if (!shifts.length) return { buffer, written: 0 };
  const zip = await JSZip.loadAsync(buffer);
  const path = await sheetPath(zip, SHIFTS_SHEET);
  let xml = await zip.file(path)!.async("string");

  const rows = new Map<number, string>();
  for (const match of xml.matchAll(/<row r="(\d+)"[^>]*>.*?<\/row>/gs)) {
    const number = Number(match[1]);
    if (number >= FIRST_ROW && number <= LAST_ROW) rows.set(number, match[0]);
  }
  const isFilled = (row: string, number: number) => new RegExp(`<c r="[BD]${number}"[^>]*>(?:(?!</c>).)*<(?:v|is)>`, "s").test(row);
  let lastFilled = FIRST_ROW - 1;
  for (const [number, row] of rows) if (isFilled(row, number)) lastFilled = Math.max(lastFilled, number);
  if (lastFilled + shifts.length > LAST_ROW) throw new AppError(409, "В листе «Смены» закончились строки", "PAYROLL_SHEET_FULL");

  shifts.forEach((shift, index) => {
    const number = lastFilled + 1 + index;
    let row = rows.get(number);
    if (!row) throw new AppError(500, `В листе «Смены» нет строки ${number}`, "PAYROLL_BAD_FILE");
    const original = row;
    const hasTimes = Boolean(shift.startTime && shift.endTime);
    row = setCell(row, "B", number, { number: excelDate(shift.workDate) });
    row = setCell(row, "D", number, { text: shift.employeeName });
    row = setCell(row, "E", number, hasTimes ? { number: toMinutes(shift.startTime!) / 1440 } : null);
    row = setCell(row, "F", number, hasTimes ? { number: toMinutes(shift.endTime!) / 1440 } : null);
    row = setCell(row, "G", number, shift.breakHours ? { number: shift.breakHours } : null);
    row = setCell(row, "H", number, shift.manualHours != null ? { number: shift.manualHours } : null);
    row = setCell(row, "M", number, { text: shift.status });
    row = setCell(row, "N", number, shift.comment ? { text: shift.comment } : null);
    xml = xml.replace(original, () => row!);
  });

  zip.file(path, xml);
  const output = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  return { buffer: output, written: shifts.length };
}

export async function getMasterWorkbook() {
  return prisma.payrollWorkbook.findUnique({ where: { key: WORKBOOK_KEY } });
}

export async function saveMasterWorkbook(fileName: string, data: Buffer) {
  await validateWorkbook(data);
  return prisma.payrollWorkbook.upsert({
    where: { key: WORKBOOK_KEY },
    create: { key: WORKBOOK_KEY, fileName, data },
    update: { fileName, data }
  });
}

let exporting: Promise<unknown> = Promise.resolve();

// Writes every pending shift into the master file and stores the result as the new master, so a file that
// was handed out is always the one the next export continues from.
export function exportPendingShifts() {
  const run = exporting.then(async () => {
    const master = await getMasterWorkbook();
    if (!master) throw new AppError(409, "Сначала загрузите таблицу зарплат", "PAYROLL_NO_WORKBOOK");
    const pending = await prisma.staffShift.findMany({
      where: { exportedAt: null },
      orderBy: [{ workDate: "asc" }, { createdAt: "asc" }],
      include: { tournament: { select: { title: true } } }
    });
    const result = await appendShifts(Buffer.from(master.data), pending.map((shift) => ({
      workDate: shift.workDate,
      employeeName: shift.employeeName,
      startTime: shift.startTime,
      endTime: shift.endTime,
      breakHours: shift.breakHours,
      manualHours: shift.manualHours,
      status: shift.status,
      comment: [shift.tournament.title, shift.comment].filter(Boolean).join(" · ") || null
    })));
    if (pending.length) {
      await prisma.$transaction([
        prisma.payrollWorkbook.update({ where: { key: WORKBOOK_KEY }, data: { data: result.buffer } }),
        prisma.staffShift.updateMany({ where: { id: { in: pending.map((shift) => shift.id) } }, data: { exportedAt: new Date() } })
      ]);
    }
    return { fileName: master.fileName, data: result.buffer, written: result.written };
  });
  exporting = run.catch(() => undefined);
  return run;
}
