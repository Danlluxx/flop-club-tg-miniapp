import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronRight, Download, Pencil, Trash2, Upload } from "lucide-react";
import { Link } from "react-router-dom";
import { api, type PayrollShift, type PayrollShiftInput } from "../../lib/api";
import { formatBarnaulDateTime } from "../../lib/barnaulDate";
import { useToast } from "../../components/Toast";
import { PayrollCalendar } from "../../components/PayrollCalendar";

const fieldClass = "w-full rounded-[0.75rem] border border-white/10 bg-white/5 px-3 py-3 text-white outline-none focus:border-electric";
const STATUSES: PayrollShiftInput["status"][] = ["Отработана", "Запланирована", "Неявка"];
const emptyForm = { employeeName: "", startTime: "", endTime: "", breakHours: "", manualHours: "", status: "Отработана" as PayrollShiftInput["status"], comment: "" };

const formatHours = (value: number) => `${String(Math.round(value * 100) / 100).replace(".", ",")} ч`;

function toInput(form: typeof emptyForm): PayrollShiftInput {
  return {
    employeeName: form.employeeName,
    startTime: form.startTime || null,
    endTime: form.endTime || null,
    breakHours: form.breakHours ? Number(form.breakHours.replace(",", ".")) : null,
    manualHours: form.manualHours ? Number(form.manualHours.replace(",", ".")) : null,
    status: form.status,
    comment: form.comment.trim() || null
  };
}

export function PayrollPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const access = useQuery({ queryKey: ["admin", "analytics-access"], queryFn: api.analyticsAccess });
  const isOwner = Boolean(access.data?.allowed);
  const fileInput = useRef<HTMLInputElement>(null);
  const [tournamentId, setTournamentId] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const status = useQuery({ queryKey: ["admin", "payroll", "status"], queryFn: api.payrollStatus });
  const staff = useQuery({ queryKey: ["admin", "payroll", "staff"], queryFn: api.payrollStaff });
  const tournaments = useQuery({ queryKey: ["admin", "payroll", "tournaments"], queryFn: api.payrollTournaments });
  // По умолчанию — последний начавшийся турнир (часы вносят после игры), иначе ближайший предстоящий.
  const started = tournaments.data?.find((item) => new Date(item.startsAt).getTime() <= Date.now());
  const selected = tournamentId || started?.id || tournaments.data?.at(-1)?.id || "";
  const shifts = useQuery({ queryKey: ["admin", "payroll", "shifts", selected], queryFn: () => api.payrollShifts(selected), enabled: Boolean(selected) });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin", "payroll"] });
  const reset = () => { setEditing(null); setForm(emptyForm); };
  const onError = (error: Error) => showToast(error.message, "error");

  const save = useMutation({
    mutationFn: () => editing ? api.updatePayrollShift(editing, toInput(form)) : api.addPayrollShift(selected, toInput(form)),
    onSuccess: () => { reset(); void refresh(); showToast(editing ? "Смена обновлена" : "Смена добавлена"); },
    onError
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.deletePayrollShift(id),
    onSuccess: () => { void refresh(); },
    onError
  });
  const upload = useMutation({
    mutationFn: (file: File) => api.uploadPayrollWorkbook(file),
    onSuccess: (result) => { void refresh(); showToast(`Таблица загружена, смен в приложении: ${result.imported}${result.skipped ? `, без турнира пропущено: ${result.skipped}` : ""}`); },
    onError
  });

  const tournament = tournaments.data?.find((item) => item.id === selected);
  const list = shifts.data ?? [];
  const totalHours = list.reduce((sum, shift) => sum + shift.hours, 0);
  const counted = form.status === "Отработана";

  function startEdit(shift: PayrollShift) {
    setEditing(shift.id);
    setForm({
      employeeName: shift.employeeName,
      startTime: shift.startTime ?? "",
      endTime: shift.endTime ?? "",
      breakHours: shift.breakHours != null ? String(shift.breakHours) : "",
      manualHours: shift.manualHours != null ? String(shift.manualHours) : "",
      status: shift.status,
      comment: shift.comment ?? ""
    });
  }

  return (
    <section className="space-y-4">
      <Link to="/admin" className="tap inline-flex items-center gap-2 text-sm font-bold text-slate-400">
        <ArrowLeft className="h-4 w-4" /> Админ
      </Link>
      <div>
        <h2 className="page-title text-[2.4rem]">Смены</h2>
      </div>

      {isOwner && (
        <Link to="/admin/payroll/analytics" className="app-panel tap flex items-center justify-between p-4">
          <span className="text-sm font-black text-white">Аналитика: часы и заработок</span>
          <ChevronRight className="h-4 w-4 text-slate-400" />
        </Link>
      )}

      {status.data && !status.data.hasWorkbook && (
        <div className="app-panel p-4 text-sm font-semibold text-amber-200">
          Таблица зарплат ещё не загружена. {isOwner ? "Загрузите файл ниже: из неё берётся список сотрудников." : "Попросите владельца загрузить таблицу."}
        </div>
      )}

      <PayrollCalendar tournaments={tournaments.data ?? []} selectedId={selected} onSelect={(id) => { setTournamentId(id); reset(); }} />
      {tournament && <p className="text-sm text-slate-400">{tournament.title.toUpperCase()} · {formatBarnaulDateTime(tournament.startsAt)}</p>}

      <div className="space-y-3">
        {shifts.isLoading && <div className="app-panel p-5">Загрузка...</div>}
        {!shifts.isLoading && list.length === 0 && <div className="app-panel p-5 text-sm font-semibold text-slate-400">Смен на этом турнире пока нет.</div>}
        {list.map((shift) => (
          <div key={shift.id} className="app-panel flex items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="truncate font-black text-white">{shift.employeeName}</p>
              <p className="mt-1 text-xs font-semibold text-slate-400">
                {shift.startTime && shift.endTime ? `${shift.startTime}–${shift.endTime}` : "часы вручную"}
                {shift.breakHours ? ` · перерыв ${formatHours(shift.breakHours)}` : ""} · {shift.status}
              </p>
              {shift.comment && <p className="mt-1 truncate text-xs text-slate-500">{shift.comment}</p>}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-sm font-black text-white">{formatHours(shift.hours)}</span>
              {shift.exported ? (
                <span className="rounded-[0.4rem] bg-white/10 px-1.5 py-0.5 text-[0.65rem] font-bold text-slate-300">в таблице</span>
              ) : (
                <>
                  <button type="button" aria-label="Изменить смену" onClick={() => startEdit(shift)} className="tap grid h-9 w-9 place-items-center rounded-[0.55rem] bg-white/8 text-white">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button type="button" aria-label="Удалить смену" disabled={remove.isPending} onClick={() => remove.mutate(shift.id)} className="tap grid h-9 w-9 place-items-center rounded-[0.55rem] bg-white/8 text-rose-200">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
        {list.length > 0 && <p className="text-right text-sm font-bold text-slate-300">Всего: {formatHours(totalHours)}</p>}
      </div>

      {selected && (
        <form
          className="app-panel grid gap-3 p-4"
          onSubmit={(event) => { event.preventDefault(); save.mutate(); }}
        >
          <p className="text-sm font-black text-white">{editing ? "Изменить смену" : "Добавить смену"}</p>
          <label className="grid gap-1.5 text-xs font-semibold text-slate-400">Сотрудник
            <select className={fieldClass} required value={form.employeeName} onChange={(event) => setForm({ ...form, employeeName: event.target.value })}>
              <option value="">Выберите…</option>
              {(staff.data ?? []).map((employee) => (
                <option key={employee.name} value={employee.name}>{employee.name}{employee.position ? ` · ${employee.position}` : ""}</option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1.5 text-xs font-semibold text-slate-400">Начало
              <input className={fieldClass} type="time" value={form.startTime} onChange={(event) => setForm({ ...form, startTime: event.target.value })} />
            </label>
            <label className="grid gap-1.5 text-xs font-semibold text-slate-400">Конец
              <input className={fieldClass} type="time" value={form.endTime} onChange={(event) => setForm({ ...form, endTime: event.target.value })} />
            </label>
            <label className="grid gap-1.5 text-xs font-semibold text-slate-400">Перерыв, ч
              <input className={fieldClass} inputMode="decimal" placeholder="0" value={form.breakHours} onChange={(event) => setForm({ ...form, breakHours: event.target.value })} />
            </label>
            <label className="grid gap-1.5 text-xs font-semibold text-slate-400">Часы вручную
              <input className={fieldClass} inputMode="decimal" placeholder="вместо времени" value={form.manualHours} onChange={(event) => setForm({ ...form, manualHours: event.target.value })} />
            </label>
          </div>
          <label className="grid gap-1.5 text-xs font-semibold text-slate-400">Статус
            <select className={fieldClass} value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as PayrollShiftInput["status"] })}>
              {STATUSES.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label className="grid gap-1.5 text-xs font-semibold text-slate-400">Комментарий
            <input className={fieldClass} maxLength={200} value={form.comment} onChange={(event) => setForm({ ...form, comment: event.target.value })} />
          </label>
          {counted && !form.manualHours && !(form.startTime && form.endTime) && (
            <p className="text-xs font-semibold text-slate-500">Укажите начало и конец смены или число часов.</p>
          )}
          <div className="flex gap-3">
            <button type="submit" disabled={save.isPending} className="tap flex-1 rounded-[0.55rem] bg-white px-4 py-3 text-sm font-black text-graphite disabled:opacity-50">
              {save.isPending ? "Сохраняем..." : editing ? "Сохранить" : "Добавить"}
            </button>
            {editing && <button type="button" onClick={reset} className="tap rounded-[0.55rem] bg-white/8 px-4 py-3 text-sm font-bold text-white">Отмена</button>}
          </div>
        </form>
      )}

      {isOwner && (
        <div className="app-panel space-y-3 p-4">
          <div>
            <p className="text-sm font-black text-white">Таблица зарплат</p>
            <p className="mt-1 text-xs font-semibold text-slate-400">
              {status.data?.hasWorkbook ? `${status.data.fileName} · ждут записи: ${status.data.pending}` : "Не загружена"}
            </p>
          </div>
          <input ref={fileInput} type="file" accept=".xlsx" hidden onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) upload.mutate(file);
            event.target.value = "";
          }} />
          <div className="grid grid-cols-2 gap-3">
            <button type="button" disabled={!status.data?.hasWorkbook} onClick={() => void api.downloadPayrollWorkbook(status.data?.fileName ?? "ЗП FLOP CLUB.xlsx").then(() => refresh()).catch(onError)}
              className="tap flex items-center justify-center gap-2 rounded-[0.55rem] bg-white px-4 py-3 text-sm font-black text-graphite disabled:opacity-50">
              <Download className="h-4 w-4" /> Скачать
            </button>
            <button type="button" disabled={upload.isPending} onClick={() => fileInput.current?.click()}
              className="tap flex items-center justify-center gap-2 rounded-[0.55rem] bg-white/8 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">
              <Upload className="h-4 w-4" /> Заменить файл
            </button>
          </div>
          <p className="text-xs text-slate-500">Скачивание дописывает новые смены в таблицу, этот файл становится основным. При загрузке смены с 1 сентября подтягиваются из таблицы в приложение: правки в Excel попадают сюда, а старая копия сотрёт более свежие смены.</p>
        </div>
      )}
    </section>
  );
}
