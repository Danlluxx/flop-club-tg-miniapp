import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { CheckCircle2, Clock3 } from "lucide-react";
import type { Registration } from "../types";

type CheckInQrProps = {
  registration: Registration;
};

export function CheckInQr({ registration }: CheckInQrProps) {
  const [qrUrl, setQrUrl] = useState("");
  const isCheckedIn = Boolean(registration.checkedInAt);

  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(`flop-checkin:${registration.checkInToken}`, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 220,
      color: {
        dark: "#111111",
        light: "#ffffff"
      }
    }).then((url) => {
      if (alive) setQrUrl(url);
    });

    return () => {
      alive = false;
    };
  }, [registration.checkInToken]);

  return (
    <section className="app-panel overflow-hidden p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">QR на входе</p>
          <h2 className="mt-2 text-xl font-black text-white">{isCheckedIn ? "Вы участвуете" : "Покажите администратору"}</h2>
          <p className="mt-1 text-sm font-semibold text-slate-400">
            {isCheckedIn ? "Приход уже подтвержден." : "После скана статус изменится с “Записан” на “Участвует”."}
          </p>
        </div>
        <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-xs font-black ${
          isCheckedIn ? "bg-emerald/15 text-emerald" : "bg-amber-300/15 text-amber-200"
        }`}>
          {isCheckedIn ? <CheckCircle2 className="h-4 w-4" /> : <Clock3 className="h-4 w-4" />}
          {isCheckedIn ? "Участвует" : "Записан"}
        </span>
      </div>

      {qrUrl ? (
        <div className="mt-4 grid place-items-center rounded-[1.5rem] bg-white p-4">
          <img className="h-52 w-52" src={qrUrl} alt="QR код регистрации" />
        </div>
      ) : (
        <div className="mt-4 h-60 animate-pulse rounded-[1.5rem] bg-white/10" />
      )}
    </section>
  );
}
