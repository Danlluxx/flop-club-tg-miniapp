import { ArrowLeft, MapPin, Spade } from "lucide-react";
import { Link } from "react-router-dom";

const yandexMapsUrl = "https://yandex.ru/maps/?text=%D0%B3.%20%D0%91%D0%B0%D1%80%D0%BD%D0%B0%D1%83%D0%BB%2C%20%D1%83%D0%BB.%20%D0%93%D0%B5%D0%B1%D0%BB%D0%B5%D1%80%D0%B0%2033%20%D0%B1";

export function ClubPage() {
  return (
    <section className="space-y-5">
      <Link to="/" className="inline-flex items-center gap-2 text-sm font-bold text-slate-300">
        <ArrowLeft className="h-4 w-4" />
        Назад
      </Link>

      <div className="app-panel p-5">
        <Spade className="h-10 w-10 text-electric" />
        <p className="page-kicker mt-5">Flop Club / Barnaul</p>
        <h2 className="page-title mt-3">О клубе</h2>
        <p className="page-subtitle mt-4">
          Flop Club — клуб спортивного офлайн-покера в Барнауле. Здесь вы найдете атмосферу настоящего покера, бар, кальяны и кухню. В приложении можно смотреть ближайшие турниры, бронировать место и следить за своим рейтингом.
        </p>
        <img className="club-photo mt-5" src="/flop-club-room.jpg" alt="Flop Club Барнаул" />
      </div>

      <a
        href={yandexMapsUrl}
        target="_blank"
        rel="noreferrer"
        className="app-panel tap block p-5 text-white"
      >
        <div className="flex items-center gap-3 text-2xl font-black">
          <MapPin className="h-8 w-8" />
          Адрес
        </div>
        <p className="mt-4 text-lg font-bold leading-snug text-slate-400">
          г. Барнаул, ул. Геблера 33 б
        </p>
      </a>
    </section>
  );
}
