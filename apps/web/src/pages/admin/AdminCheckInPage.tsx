import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ArrowRight, CheckCircle2, Loader2, UserCheck } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../../lib/api";
import type { Registration } from "../../types";

type AdminCheckInPageProps = {
  token?: string;
};

function registrationName(registration?: Registration | null) {
  const user = registration?.user;
  return user?.displayName || [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.username || user?.telegramId || "Игрок";
}

export function AdminCheckInPage({ token }: AdminCheckInPageProps) {
  const params = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const checkInToken = useMemo(() => token || params.token || "", [params.token, token]);
  const [started, setStarted] = useState(false);

  const checkIn = useMutation({
    mutationFn: () => api.adminCheckIn(checkInToken),
    onSuccess: async (registration) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["participants", registration.tournamentId] }),
        queryClient.invalidateQueries({ queryKey: ["admin", "live", registration.tournamentId] }),
        queryClient.invalidateQueries({ queryKey: ["tournament", registration.tournamentId] }),
        queryClient.invalidateQueries({ queryKey: ["myRegistrations"] })
      ]);
    }
  });

  useEffect(() => {
    if (!checkInToken || started) return;
    setStarted(true);
    checkIn.mutate();
  }, [checkIn, checkInToken, started]);

  const registration = checkIn.data;
  const title = registration?.tournament?.title ?? "Турнир";
  const seatText = registration?.tableNumber && registration?.seatNumber ? `Стол ${registration.tableNumber}, бокс ${registration.seatNumber}` : "Место будет назначено автоматически";

  return (
    <section className="space-y-5">
      <button
        type="button"
        onClick={() => navigate("/admin")}
        className="screen-back tap"
        aria-label="Назад"
      >
        <ArrowRight className="h-5 w-5 rotate-180" />
      </button>

      <div>
        <p className="text-xs font-bold uppercase tracking-[0.32em] text-slate-500">FLOP CLUB</p>
        <h1 className="page-title mt-3 text-[3rem]">QR-вход</h1>
      </div>

      <div className="app-panel p-5">
        {!checkInToken && (
          <div className="space-y-3 text-center">
            <AlertCircle className="mx-auto h-10 w-10 text-rose-300" />
            <h2 className="text-2xl font-black">QR не распознан</h2>
            <p className="text-sm font-semibold text-slate-400">В ссылке нет токена регистрации.</p>
          </div>
        )}

        {checkInToken && checkIn.isPending && (
          <div className="space-y-4 text-center">
            <Loader2 className="mx-auto h-10 w-10 animate-spin text-rose-300" />
            <div>
              <h2 className="text-2xl font-black">Проверяем QR</h2>
              <p className="mt-2 text-sm font-semibold text-slate-400">Если запись найдена, участник будет отмечен как пришедший.</p>
            </div>
          </div>
        )}

        {checkIn.isError && (
          <div className="space-y-4 text-center">
            <AlertCircle className="mx-auto h-10 w-10 text-rose-300" />
            <div>
              <h2 className="text-2xl font-black">Не удалось отметить</h2>
              <p className="mt-2 text-sm font-semibold text-slate-400">{checkIn.error.message}</p>
            </div>
            <button
              type="button"
              className="app-button-primary tap w-full"
              onClick={() => {
                setStarted(false);
                checkIn.reset();
              }}
            >
              Повторить
            </button>
          </div>
        )}

        {checkIn.isSuccess && registration && (
          <div className="space-y-5">
            <div className="flex items-center gap-4">
              <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-emerald/15 text-emerald">
                <CheckCircle2 className="h-8 w-8" />
              </span>
              <div className="min-w-0">
                <h2 className="text-2xl font-black">Участник отмечен</h2>
                <p className="mt-1 truncate text-sm font-semibold text-slate-400">{title}</p>
              </div>
            </div>

            <div className="rounded-[1.5rem] border border-white/10 bg-black/20 p-4">
              <div className="flex items-start gap-3">
                <UserCheck className="mt-0.5 h-5 w-5 shrink-0 text-rose-300" />
                <div className="min-w-0">
                  <p className="truncate text-xl font-black text-white">{registrationName(registration)}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-400">{seatText}</p>
                </div>
              </div>
            </div>

            <Link
              to={`/admin/tournaments/${registration.tournamentId}/participants`}
              className="app-button-primary tap flex w-full items-center justify-center"
            >
              Открыть участников
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
