import { useMutation } from "@tanstack/react-query";
import { ChevronsDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import type { User } from "../types";
import { useToast } from "./Toast";

export const currentRulesVersion = "2026-05-22";

const definitions = [
  ["Клуб", "Flop Club, организующий клубные встречи и турниры в Барнауле."],
  ["Администрация", "представители Клуба, которые формируют расписание, ведут запись и обеспечивают порядок на мероприятиях."],
  ["Мероприятие", "клубная встреча или турнир, опубликованный в приложении с датой, временем, местом и условиями участия."],
  ["Участник", "совершеннолетний пользователь, записавшийся на Мероприятие и допущенный Администрацией к участию."],
  ["Приложение", "Telegram Mini App Flop Club для просмотра расписания, записи на Мероприятия и получения уведомлений."],
  ["Регистрация", "заявка Участника на место в конкретном Мероприятии через Приложение или по решению Администрации."]
] as const;

const numberedRules = [
  "Пользователь обязуется указывать и использовать свои актуальные Telegram-данные при записи через Приложение.",
  "Место считается забронированным после успешной Регистрации, пока она активна и не отменена Участником или Администрацией.",
  "Если лимит мест исчерпан, регистрация может быть недоступна. Администрация вправе уточнить состав участников перед началом Мероприятия.",
  "Участник обязан соблюдать правила площадки, уважительно общаться с другими гостями и персоналом Клуба.",
  "Запрещены агрессивное, оскорбительное, мошенническое поведение, попытки сорвать Мероприятие и действия, нарушающие права других лиц.",
  "Администрация вправе отказать в допуске или прекратить участие при нарушении правил, требований безопасности или порядка на площадке.",
  "Условия конкретного турнира, включая время старта, формат, лимит мест и опубликованные параметры, могут быть уточнены Администрацией до начала Мероприятия.",
  "Приложение используется как цифровой канал информирования и записи. Нельзя пытаться обходить ограничения регистрации, подменять Telegram-данные или получать доступ к админ-функциям без разрешения."
] as const;

export function RulesGate({ onAccepted }: { onAccepted: (user: User) => void }) {
  const contentRef = useRef<HTMLDivElement>(null);
  const { showToast } = useToast();
  const [readToEnd, setReadToEnd] = useState(false);

  function updateReadState() {
    const element = contentRef.current;
    if (!element) return;
    const reachedEnd = element.scrollTop + element.clientHeight >= element.scrollHeight - 72;
    setReadToEnd(reachedEnd);
  }

  useEffect(() => {
    updateReadState();
  }, []);

  const accept = useMutation({
    mutationFn: api.acceptRules,
    onSuccess: onAccepted,
    onError: (error) => showToast(error.message, "error")
  });

  function scrollForward() {
    contentRef.current?.scrollBy({ top: Math.max(320, window.innerHeight * 0.62), behavior: "smooth" });
  }

  return (
    <section className="rules-screen">
      <div ref={contentRef} onScroll={updateReadState} className="rules-copy">
        <div className="mx-auto max-w-md px-5 pb-52 pt-8">
          <p className="text-[11px] font-bold uppercase tracking-[0.34em] text-electric">Flop Club / Barnaul</p>
          <h1 className="rules-title mt-5">Пользовательское соглашение</h1>

          <h2 className="mt-16 text-3xl font-black leading-tight">Правила посещения и участия в мероприятиях Flop Club</h2>
          <p className="mt-7 text-xl font-bold leading-snug">
            Эти правила помогают поддерживать порядок, безопасность и уважительную атмосферу на мероприятиях Клуба.
          </p>
          <p className="mt-7 text-xl font-bold leading-snug">
            Открывая Приложение, записываясь на турнир и подтверждая принятие правил, Пользователь соглашается соблюдать положения этой редакции.
          </p>
          <p className="mt-8 text-xl font-black">Редакция от 22 мая 2026 г.</p>

          <h2 className="rules-heading">Термины и определения</h2>
          <p className="rules-paragraph">В настоящих Правилах используются следующие значения:</p>
          <div className="mt-7 space-y-6">
            {definitions.map(([term, description]) => (
              <p key={term} className="rules-paragraph">
                <strong>{term}</strong> - {description}
              </p>
            ))}
          </div>

          <h2 className="rules-heading">Общие положения</h2>
          <div className="space-y-6">
            <p className="rules-paragraph">1.1. Правила регулируют порядок использования Приложения и участия в мероприятиях Flop Club.</p>
            <p className="rules-paragraph">1.2. Приложение показывает расписание, статус регистрации, количество мест и данные, указанные для конкретного турнира.</p>
            <p className="rules-paragraph">1.3. Подтверждение принятия Правил фиксируется в профиле Пользователя и требуется до доступа к функциям записи.</p>
            <p className="rules-paragraph">1.4. Новая редакция Правил может быть опубликована в Приложении. Для существенных изменений Клуб вправе запросить повторное принятие.</p>
          </div>

          <h2 className="rules-heading">Регистрация и участие</h2>
          <div className="space-y-6">
            {numberedRules.map((rule, index) => (
              <p key={rule} className="rules-paragraph">2.{index + 1}. {rule}</p>
            ))}
          </div>

          <h2 className="rules-heading">Данные и уведомления</h2>
          <div className="space-y-6">
            <p className="rules-paragraph">3.1. Для авторизации Приложение использует данные Telegram, переданные при открытии Mini App.</p>
            <p className="rules-paragraph">3.2. Клуб может использовать эти данные для записи, идентификации участника, управления списками турниров и показа уведомлений внутри Приложения.</p>
            <p className="rules-paragraph">3.3. Пользователь отвечает за доступ к своему Telegram-аккаунту и должен сообщать Администрации о спорных регистрациях.</p>
          </div>

          <h2 className="rules-heading">Заключительные положения</h2>
          <div className="space-y-6">
            <p className="rules-paragraph">4.1. Спорные ситуации рассматриваются Администрацией с учётом обстоятельств, опубликованных условий Мероприятия и настоящих Правил.</p>
            <p className="rules-paragraph">4.2. Если отдельное положение Правил требует уточнения, остальные положения продолжают действовать.</p>
            <p className="rules-paragraph">4.3. Нажимая кнопку «Принять», Пользователь подтверждает, что ознакомился с этой редакцией Правил и согласен соблюдать её при использовании Приложения.</p>
          </div>
        </div>
      </div>

      <div className="rules-actions">
        {!readToEnd && (
          <button type="button" onClick={scrollForward} className="rules-scroll" aria-label="Прокрутить правила ниже">
            <ChevronsDown className="h-5 w-5" />
          </button>
        )}
        <button
          type="button"
          disabled={!readToEnd || accept.isPending}
          onClick={() => accept.mutate()}
          className="rules-accept tap"
        >
          {accept.isPending ? "Сохраняем..." : "Принять"}
        </button>
      </div>
    </section>
  );
}
