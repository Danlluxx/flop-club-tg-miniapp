import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";
import JSZip from "jszip";

process.env.DATABASE_URL = "postgresql://test:test@localhost:1/test";
process.env.BOT_TOKEN = "test";
process.env.JWT_SECRET = "test-secret-for-payroll-tests";
process.env.FRONTEND_URL = "http://localhost:5173";

const { appendShifts, readRoster, shiftHours, validateWorkbook } = await import("../dist/services/payrollWorkbook.js");

// Minimal stand-in for the salary table: styled empty cells like the template rows, one shift already written.
async function makeWorkbook() {
  const workbook = new ExcelJS.Workbook();
  const shifts = workbook.addWorksheet("Смены");
  for (let row = 6; row <= 12; row += 1) {
    for (const column of "BCDEFGHIJKLMN") shifts.getCell(`${column}${row}`).font = { name: "Arial" };
  }
  shifts.getCell("B6").value = 46300;
  shifts.getCell("D6").value = "Гриша";
  const staff = workbook.addWorksheet("Сотрудники");
  staff.getCell("C6").value = "Гриша";
  staff.getCell("D6").value = "Дилер";
  staff.getCell("J6").value = "Работает";
  staff.getCell("C7").value = "Лиля";
  staff.getCell("J7").value = "Уволен";
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

const shift = (patch = {}) => ({
  workDate: "2026-11-11",
  employeeName: "Лиля",
  startTime: "18:30",
  endTime: "01:00",
  breakHours: 0.5,
  manualHours: null,
  status: "Отработана",
  comment: null,
  ...patch
});

test("shiftHours handles overnight shifts, breaks and manual hours", () => {
  assert.equal(shiftHours(shift()), 6);
  assert.equal(shiftHours(shift({ startTime: "19:00", endTime: "23:00", breakHours: null })), 4);
  assert.equal(shiftHours(shift({ manualHours: 3.5 })), 3.5);
  assert.equal(shiftHours(shift({ startTime: null, endTime: null })), 0);
});

test("appendShifts writes below the last filled row and keeps the rest of the file", async () => {
  const source = await makeWorkbook();
  await validateWorkbook(source);
  const { buffer, written } = await appendShifts(source, [shift(), shift({ employeeName: "Гриша", startTime: null, endTime: null, manualHours: 4, comment: "A & B" })]);
  assert.equal(written, 2);

  const sheet = (await new ExcelJS.Workbook().xlsx.load(buffer)).getWorksheet("Смены");
  assert.equal(sheet.getCell("D6").value, "Гриша");
  assert.equal(sheet.getCell("D7").value, "Лиля");
  assert.equal(sheet.getCell("B7").value, 46337); // Excel serial of 2026-11-11
  assert.ok(Math.abs(sheet.getCell("E7").value - 18.5 / 24) < 1e-9);
  assert.ok(Math.abs(sheet.getCell("F7").value - 1 / 24) < 1e-9);
  assert.equal(sheet.getCell("G7").value, 0.5);
  assert.equal(sheet.getCell("H8").value, 4);
  assert.equal(sheet.getCell("N8").value, "A & B");
  assert.ok(await JSZip.loadAsync(buffer));
});

test("appendShifts refuses when the sheet has no rows left", async () => {
  await assert.rejects(appendShifts(await makeWorkbook(), Array.from({ length: 10 }, () => shift())), /закончились строки|нет строки/);
});

test("readRoster lists employees with position and status", async () => {
  const roster = await readRoster(await makeWorkbook());
  assert.deepEqual(roster.map((employee) => [employee.name, employee.position, employee.status]), [["Гриша", "Дилер", "Работает"], ["Лиля", "", "Уволен"]]);
});

test("validateWorkbook rejects files that are not the salary table", async () => {
  await assert.rejects(validateWorkbook(Buffer.from("not a zip")), /Excel/);
  const empty = new ExcelJS.Workbook();
  empty.addWorksheet("Other");
  await assert.rejects(validateWorkbook(Buffer.from(await empty.xlsx.writeBuffer())), /Смены/);
});

test("readWorkbookShifts reads shifts from September on, skipping fines and older rows", async () => {
  const { readWorkbookShifts } = await import("../dist/services/payrollWorkbook.js");
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Смены");
  workbook.addWorksheet("Сотрудники");
  const put = (row, date, name, extra = {}) => {
    sheet.getCell(`B${row}`).value = new Date(Date.UTC(...date));
    sheet.getCell(`D${row}`).value = name;
    for (const [column, value] of Object.entries(extra)) sheet.getCell(`${column}${row}`).value = value;
  };
  put(6, [2026, 7, 30], "Старая", { H: 5 });
  put(7, [2026, 8, 3], "Гриша", { H: 4, M: "Отработана" });
  put(8, [2026, 9, 2], "Арсений", { E: new Date(Date.UTC(1899, 11, 30, 19, 0)), F: 23 / 24, G: 0.5, M: "Неявка", N: "заметка" });
  put(9, [2026, 10, 12], "Гриша", { H: 0, K: -500 });
  const shifts = await readWorkbookShifts(Buffer.from(await workbook.xlsx.writeBuffer()));
  assert.equal(shifts.length, 2);
  assert.deepEqual(shifts[0], { workDate: "2026-09-03", employeeName: "Гриша", startTime: null, endTime: null, breakHours: null, manualHours: 4, status: "Отработана", comment: null });
  assert.equal(shifts[1].startTime, "19:00");
  assert.equal(shifts[1].endTime, "23:00");
  assert.equal(shifts[1].breakHours, 0.5);
  assert.equal(shifts[1].status, "Неявка");
});
