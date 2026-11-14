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
  adjustment: null,
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

test("readWorkbookShifts reads shifts from September on, keeping fines and skipping empty and older rows", async () => {
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
  put(9, [2026, 10, 12], "Гриша", { H: 0, K: -500, N: "Штраф" });
  put(10, [2026, 10, 12], "Лиля", { H: 0 });
  const shifts = await readWorkbookShifts(Buffer.from(await workbook.xlsx.writeBuffer()));
  assert.equal(shifts.length, 3);
  assert.deepEqual(shifts[0], { workDate: "2026-09-03", employeeName: "Гриша", startTime: null, endTime: null, breakHours: null, manualHours: 4, adjustment: null, status: "Отработана", comment: null });
  assert.equal(shifts[1].startTime, "19:00");
  assert.equal(shifts[1].endTime, "23:00");
  assert.equal(shifts[1].breakHours, 0.5);
  assert.equal(shifts[1].status, "Неявка");
  assert.deepEqual([shifts[2].employeeName, shifts[2].manualHours, shifts[2].adjustment, shifts[2].comment], ["Гриша", null, -500, "Штраф"]);
});

test("periodRange and shiftEarnings follow the table rules", async () => {
  const { periodRange, shiftEarnings } = await import("../dist/services/payrollAnalytics.js");
  assert.deepEqual(periodRange("day", "2026-11-12"), { from: "2026-11-12", to: "2026-11-12" });
  assert.deepEqual(periodRange("week", "2026-11-12"), { from: "2026-11-09", to: "2026-11-15" });
  assert.deepEqual(periodRange("week", "2026-11-15"), { from: "2026-11-09", to: "2026-11-15" });
  assert.deepEqual(periodRange("month", "2026-02-10"), { from: "2026-02-01", to: "2026-02-28" });
  assert.deepEqual(periodRange("month", "2026-12-31"), { from: "2026-12-01", to: "2026-12-31" });
  const hourly = { name: "Гриша", position: "", status: "", payType: "Почасовая", hourlyRate: 350, shiftRate: 0 };
  const flat = { ...hourly, payType: "За смену", shiftRate: 1500 };
  assert.equal(shiftEarnings(4.5, "Отработана", hourly), 1575);
  assert.equal(shiftEarnings(4.5, "Отработана", flat), 1500);
  assert.equal(shiftEarnings(4, "Неявка", hourly), 0);
  assert.equal(shiftEarnings(4, "Отработана", undefined), 0);
});

test("planMerge keeps identical rows, takes edits from the file and writes missing app rows back", async () => {
  const { planMerge } = await import("../dist/services/payrollWorkbook.js");
  const row = (patch = {}) => ({ workDate: "2026-11-10", employeeName: "Гриша", startTime: "19:00", endTime: "23:00", breakHours: null, manualHours: null, adjustment: null, status: "Отработана", comment: null, ...patch });
  const app = (id, patch) => ({ id, shift: row(patch) });

  // identical
  let plan = planMerge([row()], [app("a")]);
  assert.deepEqual([plan.matched, plan.updates.length, plan.adds.length, plan.restore.length], [1, 0, 0, 0]);

  // edited in Excel (hours changed) -> the file wins, no duplicate
  plan = planMerge([row({ endTime: "23:30" })], [app("a")]);
  assert.deepEqual([plan.matched, plan.updates.length, plan.adds.length, plan.restore.length], [0, 1, 0, 0]);
  assert.equal(plan.updates[0].shift.endTime, "23:30");

  // old copy of the file: the app has a row the file lacks -> restored, the file's own rows stay
  plan = planMerge([row()], [app("a"), app("b", { workDate: "2026-11-11" })]);
  assert.deepEqual([plan.matched, plan.updates.length, plan.adds.length, plan.restore], [1, 0, 0, ["b"]]);

  // a new row typed in Excel -> added to the app
  plan = planMerge([row(), row({ employeeName: "Лиля" })], [app("a")]);
  assert.deepEqual([plan.matched, plan.adds.length, plan.restore.length], [1, 1, 0]);

  // two fines for one person on one day: both survive, each matched once
  const fine = (amount) => row({ startTime: null, endTime: null, adjustment: amount });
  plan = planMerge([fine(-500), fine(-175)], [app("x", fine(-175)), app("y", fine(-500))]);
  assert.deepEqual([plan.matched, plan.updates.length, plan.adds.length, plan.restore.length], [2, 0, 0, 0]);
});

test("removeShiftRows clears only the matching row", async () => {
  const { removeShiftRows, appendShifts, readWorkbookShifts } = await import("../dist/services/payrollWorkbook.js");
  const source = await makeWorkbook();
  const { buffer } = await appendShifts(source, [shift({ workDate: "2026-11-11" }), shift({ workDate: "2026-11-12", employeeName: "Гриша" })]);
  const before = await readWorkbookShifts(buffer);
  assert.equal(before.length, 2);
  const result = await removeShiftRows(buffer, [shift({ workDate: "2026-11-11" })]);
  assert.equal(result.removed, 1);
  const after = await readWorkbookShifts(result.buffer);
  assert.deepEqual(after.map((item) => item.workDate), ["2026-11-12"]);
});

test("bot command parser: names, amounts, dates, defaults", async () => {
  const { parsePayrollCommand, parseDateToken } = await import("../dist/services/payrollCommands.js");
  const roster = ["Артем", "Арсений", "Гриша", "Никита 1", "Никита 2", "Лиля"];
  const today = "2026-11-14";
  const parse = (text) => parsePayrollCommand(text, roster, today);

  assert.deepEqual(parse("/штраф Гриша 500 опоздание"), { kind: "adjust", employee: "Гриша", amount: -500, comment: "Штраф: опоздание", date: null });
  assert.deepEqual(parse("/Штраф лиля 175"), { kind: "adjust", employee: "Лиля", amount: -175, comment: "Штраф", date: null });
  assert.deepEqual(parse("/реэнтри Гриша"), { kind: "adjust", employee: "Гриша", amount: -500, comment: "Ре-энтри (вычет из ЗП)", date: null });
  assert.equal(parse("/реэнтри Гриша 700").amount, -700);
  assert.equal(parse("/адон Гриша вчера").date, "2026-11-13");
  assert.equal(parse("/адон Гриша 12.11").date, "2026-11-12");
  assert.equal(parse("/адон Гриша").amount, -1000);
  assert.equal(parse("/премия Лиля 1000 за вечер").amount, 1000);
  assert.equal(parse("/премия Лиля 1000 за вечер").comment, "Премия: за вечер");
  assert.equal(parse("/штраф Никита 1 300").employee, "Никита 1");
  assert.equal(parse("/штраф Никита 1 300").amount, -300);
  assert.equal(parse("/штраф арс 300").employee, "Арсений");
  assert.match(parse("/штраф Ар 300").message, /несколько/);
  assert.match(parse("/штраф Никита 300").message, /несколько/);
  assert.match(parse("/штраф Вася 300").message, /Не нашёл/);
  assert.match(parse("/штраф Гриша").message, /сумму/);
  assert.match(parse("/штраф Гриша 9999999").message, /Сумма/);
  assert.deepEqual(parse("/смена Лиля 19:00 23:30"), { kind: "shift", employee: "Лиля", startTime: "19:00", endTime: "23:30", manualHours: null, comment: null, date: null });
  assert.equal(parse("/смена Лиля 4,5 вчера").manualHours, 4.5);
  assert.equal(parse("/смена Лиля 4,5 вчера").date, "2026-11-13");
  assert.equal(parse("/отмена").kind, "undo");
  assert.equal(parse("/таблица").kind, "table");
  assert.equal(parse("/start"), null);
  assert.equal(parseDateToken("31.02", today), null);
  assert.equal(parseDateToken("5.1.27", today), "2027-01-05");
});
