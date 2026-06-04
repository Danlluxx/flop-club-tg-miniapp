import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../lib/api";
import type { User } from "../types";
import { useToast } from "./Toast";

type Slide = {
  kicker: string;
  titleLines: string[];
  body: string;
  art: string;
  artClassName?: string;
};

const slides: Slide[] = [
  {
    kicker: "Flop Club",
    titleLines: ["Добро", "пожаловать"],
    body: "Клубная афиша, запись на турниры и ваши активные места теперь собраны в одном Mini App.",
    art: "/flop-intro-welcome.webp",
    artClassName: "intro-art-welcome"
  },
  {
    kicker: "Турниры",
    titleLines: ["Выбирайте", "формат"],
    body: "Смотрите дату, вход, гарантию и количество мест до записи. Всё важное видно прямо в карточке турнира.",
    art: "/flop-intro-events.webp",
    artClassName: "intro-art-events"
  },
  {
    kicker: "Моя запись",
    titleLines: ["Держите место", "под рукой"],
    body: "Записывайтесь в один тап, проверяйте активные регистрации и быстро отменяйте запись, когда правила турнира это разрешают.",
    art: "/flop-intro-seat.webp",
    artClassName: "intro-art-seat"
  }
];

export function IntroCarousel({ onCompleted }: { onCompleted: (user: User) => void }) {
  const [index, setIndex] = useState(0);
  const { showToast } = useToast();
  const slide = slides[index];
  const lastSlide = index === slides.length - 1;

  const complete = useMutation({
    mutationFn: api.completeIntro,
    onSuccess: onCompleted,
    onError: (error) => showToast(error.message, "error")
  });

  function next() {
    if (lastSlide) {
      complete.mutate();
      return;
    }
    setIndex((value) => Math.min(value + 1, slides.length - 1));
  }

  return (
    <section className="intro-screen">
      <article className="intro-slide" key={slide.titleLines.join(" ")}>
        <div className="intro-copy">
          <p className="text-[11px] font-black uppercase tracking-[0.38em] text-electric">{slide.kicker}</p>
          <h1 className="intro-title">
            {slide.titleLines.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </h1>
          <p className="intro-body">{slide.body}</p>
        </div>

        <div className="intro-stage">
          <img className={`intro-art ${slide.artClassName ?? ""}`} src={slide.art} alt="" />
        </div>

        <div className="intro-controls">
          <div className="intro-dots" aria-label={`Слайд ${index + 1} из ${slides.length}`}>
            {slides.map((item, dotIndex) => (
              <span key={item.titleLines.join(" ")} className={dotIndex === index ? "intro-dot intro-dot-active" : "intro-dot"} />
            ))}
          </div>
          <button type="button" onClick={next} disabled={complete.isPending} className="intro-next tap">
            {complete.isPending ? "Открываем..." : lastSlide ? "Войти в приложение" : "Далее"}
          </button>
        </div>
      </article>
    </section>
  );
}
