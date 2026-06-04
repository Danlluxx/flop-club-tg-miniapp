import { ArrowLeft, MessageCircle } from "lucide-react";
import { Link } from "react-router-dom";

const supportUrl = (import.meta.env.VITE_SUPPORT_URL as string | undefined) || "https://t.me/flopclub";

export function SupportPage() {
  return (
    <section className="space-y-5">
      <Link to="/" className="inline-flex items-center gap-2 text-sm font-bold text-slate-300">
        <ArrowLeft className="h-4 w-4" />
        Назад
      </Link>

      <div className="app-panel p-5">
        <MessageCircle className="h-10 w-10 text-electric" />
        <p className="page-kicker mt-5">Flop Club</p>
        <h2 className="support-title mt-3">Поддержка</h2>
        <p className="page-subtitle mt-4">
          Напишите администрации Flop Club, если нужна помощь с записью, отменой регистрации или вопросом по турниру.
        </p>
        <a href={supportUrl} className="app-button-primary tap mt-6 inline-flex w-full items-center justify-center">
          Написать @flopclub
        </a>
      </div>
    </section>
  );
}
