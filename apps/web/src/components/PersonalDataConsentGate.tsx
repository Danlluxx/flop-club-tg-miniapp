import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, Camera, Check, FileText, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { api } from "../lib/api";
import type { User } from "../types";
import { useToast } from "./Toast";

export const currentPersonalDataConsentVersion = "2026-10-12";
export const currentPhotoVideoConsentVersion = "2026-10-12";
const personalDataLawUrl = "https://www.consultant.ru/document/cons_doc_LAW_61801/";
const imageLawUrl = "https://www.consultant.ru/document/cons_doc_LAW_5142/14c6c3902cffa17ab26d330b2fd4fae28e5cd059/";

const dataItems = [
  "Telegram ID, username, имя, фамилия и фото профиля, переданные Telegram Mini App.",
  "Имя, которое пользователь указывает внутри приложения Flop Club.",
  "Записи на турниры, статусы участия, места, рейтинг, нокауты и история клубных достижений.",
  "Технические данные, необходимые для авторизации, защиты доступа и работы уведомлений."
] as const;

const purposes = [
  "создание и ведение профиля участника Flop Club;",
  "запись на турниры, управление списками участников и администрирование мероприятий;",
  "расчет рейтинга, показ результатов, статусов и наград в приложении;",
  "связь с пользователем по вопросам участия, расписания и важных уведомлений клуба;",
  "защита приложения от несанкционированного доступа и ошибок в учетных данных."
] as const;

const photoVideoUsageItems = [
  "фото- и видеосъемка во время турниров, клубных встреч и других мероприятий Flop Club;",
  "использование изображения, голоса и фрагментов участия в фото, видео, сторис, постах, афишах и отчетах клуба;",
  "публикация материалов в Telegram-каналах, чатах, социальных сетях, Mini App и других официальных площадках Flop Club;",
  "хранение материалов в архиве клуба для отчетов, истории турниров, наград, рейтингов и промо-материалов."
] as const;

function ConsentDocument({ onBack }: { onBack: () => void }) {
  return (
    <section className="consent-document">
      <div className="consent-document-scroll">
        <div className="mx-auto max-w-md px-5 pb-12 pt-7">
          <button type="button" onClick={onBack} className="consent-back tap">
            <ArrowLeft className="h-5 w-5" />
            Назад
          </button>

          <p className="rules-kicker mt-8">Flop Club / Barnaul</p>
          <h1 className="rules-title mt-5">Согласие на обработку персональных данных</h1>
          <p className="rules-date">Редакция от 12 октября 2026 г.</p>

          <p className="rules-lead">
            Настоящее согласие относится к использованию Telegram Mini App Flop Club и необходимо для работы профиля,
            записи на турниры, рейтинга и клубных уведомлений.
          </p>
          <p className="rules-lead">
            Согласие запрашивается в соответствии с{" "}
            <a className="rules-link" href={personalDataLawUrl} target="_blank" rel="noreferrer">
              Федеральным законом от 27.07.2006 N 152-ФЗ «О персональных данных»
            </a>.
          </p>

          <h2 className="rules-heading">Какие данные обрабатываются</h2>
          <div className="space-y-5">
            {dataItems.map((item, index) => (
              <p key={item} className="rules-paragraph">{index + 1}. {item}</p>
            ))}
          </div>

          <h2 className="rules-heading">Цели обработки</h2>
          <div className="space-y-5">
            {purposes.map((purpose, index) => (
              <p key={purpose} className="rules-paragraph">{index + 1}. {purpose}</p>
            ))}
          </div>

          <h2 className="rules-heading">Условия обработки</h2>
          <div className="space-y-6">
            <p className="rules-paragraph">
              Данные используются только в рамках работы Flop Club, Telegram Mini App, турнирной регистрации,
              рейтинговой системы и коммуникации с участниками.
            </p>
            <p className="rules-paragraph">
              Обработка выполняется на основании согласия пользователя, которое требуется по{" "}
              <a className="rules-link" href={personalDataLawUrl} target="_blank" rel="noreferrer">
                152-ФЗ «О персональных данных»
              </a>{" "}
              для законного использования данных профиля и клубной учетной информации.
            </p>
            <p className="rules-paragraph">
              Flop Club может хранить данные до отзыва согласия или пока профиль нужен для клубного учета,
              результатов турниров и подтверждения истории участия.
            </p>
            <p className="rules-paragraph">
              Пользователь может обратиться к администрации клуба, чтобы уточнить данные, изменить отображаемое имя
              или запросить отзыв согласия, если это не противоречит обязательному хранению турнирной истории.
            </p>
          </div>

          <h2 className="rules-heading">Подтверждение</h2>
          <p className="rules-paragraph">
            Устанавливая галочку и нажимая кнопку подтверждения, пользователь свободно, своей волей и в своем интересе
            дает Flop Club согласие на обработку персональных данных на условиях этой редакции.
          </p>
        </div>
      </div>
    </section>
  );
}

function PhotoVideoDocument({ onBack }: { onBack: () => void }) {
  return (
    <section className="consent-document">
      <div className="consent-document-scroll">
        <div className="mx-auto max-w-md px-5 pb-12 pt-7">
          <button type="button" onClick={onBack} className="consent-back tap">
            <ArrowLeft className="h-5 w-5" />
            Назад
          </button>

          <p className="rules-kicker mt-8">Flop Club / Media</p>
          <h1 className="rules-title mt-5">Согласие на фото- и видеосъемку</h1>
          <p className="rules-date">Редакция от 12 октября 2026 г.</p>

          <p className="rules-lead">
            Настоящее согласие относится к съемке участников на мероприятиях Flop Club и использованию полученных
            материалов для клубных публикаций, отчетов и продвижения мероприятий.
          </p>
          <p className="rules-lead">
            Согласие на обнародование и дальнейшее использование изображения запрашивается с учетом{" "}
            <a className="rules-link" href={imageLawUrl} target="_blank" rel="noreferrer">
              статьи 152.1 Гражданского кодекса РФ «Охрана изображения гражданина»
            </a>.
            Если фото или видео используются для идентификации участника, такие материалы также могут относиться к
            персональным данным по{" "}
            <a className="rules-link" href={personalDataLawUrl} target="_blank" rel="noreferrer">
              152-ФЗ
            </a>.
          </p>

          <h2 className="rules-heading">На что дается согласие</h2>
          <div className="space-y-5">
            {photoVideoUsageItems.map((item, index) => (
              <p key={item} className="rules-paragraph">{index + 1}. {item}</p>
            ))}
          </div>

          <h2 className="rules-heading">Условия использования</h2>
          <div className="space-y-6">
            <p className="rules-paragraph">
              Материалы могут использоваться без выплаты вознаграждения, если они связаны с деятельностью клуба,
              турнирами, итогами, анонсами или атмосферой мероприятий Flop Club.
            </p>
            <p className="rules-paragraph">
              Правовой основой для публикации и дальнейшего использования изображения участника является согласие,
              предусмотренное{" "}
              <a className="rules-link" href={imageLawUrl} target="_blank" rel="noreferrer">
                статьей 152.1 ГК РФ
              </a>.
              Для материалов, позволяющих установить личность участника, дополнительно применяются требования{" "}
              <a className="rules-link" href={personalDataLawUrl} target="_blank" rel="noreferrer">
                152-ФЗ «О персональных данных»
              </a>.
            </p>
            <p className="rules-paragraph">
              Клуб не использует фото и видео в оскорбительном, вводящем в заблуждение или не связанном с клубной
              деятельностью контексте.
            </p>
            <p className="rules-paragraph">
              Если участник не хочет попадать в кадр на конкретном мероприятии, он может заранее сообщить об этом
              администрации клуба, чтобы команда съемки учла это по возможности.
            </p>
          </div>

          <h2 className="rules-heading">Подтверждение</h2>
          <p className="rules-paragraph">
            Устанавливая галочку и нажимая кнопку подтверждения, пользователь дает Flop Club согласие на фото- и
            видеосъемку, а также использование материалов на условиях этой редакции.
          </p>
        </div>
      </div>
    </section>
  );
}

function hasCurrentPersonalDataConsent(user: User) {
  return Boolean(user.personalDataConsentAt && user.personalDataConsentVersion === currentPersonalDataConsentVersion);
}

function hasCurrentPhotoVideoConsent(user: User) {
  return Boolean(user.photoVideoConsentAt && user.photoVideoConsentVersion === currentPhotoVideoConsentVersion);
}

export function PersonalDataConsentGate({ user, onAccepted }: { user: User; onAccepted: (user: User) => void }) {
  const personalAlreadyAccepted = hasCurrentPersonalDataConsent(user);
  const photoVideoAlreadyAccepted = hasCurrentPhotoVideoConsent(user);
  const [personalChecked, setPersonalChecked] = useState(personalAlreadyAccepted);
  const [photoVideoChecked, setPhotoVideoChecked] = useState(photoVideoAlreadyAccepted);
  const [documentOpen, setDocumentOpen] = useState<"personal" | "photo-video" | null>(null);
  const { showToast } = useToast();

  const accept = useMutation({
    mutationFn: async () => {
      let updatedUser = user;
      if (!personalAlreadyAccepted) {
        updatedUser = await api.acceptPersonalDataConsent();
      }
      if (!photoVideoAlreadyAccepted) {
        updatedUser = await api.acceptPhotoVideoConsent();
      }
      return updatedUser;
    },
    onSuccess: onAccepted,
    onError: (error) => showToast(error.message, "error")
  });

  if (documentOpen === "personal") {
    return <ConsentDocument onBack={() => setDocumentOpen(null)} />;
  }

  if (documentOpen === "photo-video") {
    return <PhotoVideoDocument onBack={() => setDocumentOpen(null)} />;
  }

  const canAccept = personalChecked && photoVideoChecked;

  return (
    <section className="consent-screen">
      <div className="consent-backdrop" />
      <div className="consent-sheet">
        <div className="consent-sheet-handle" />
        <div className="consent-icon">
          <ShieldCheck className="h-7 w-7" />
        </div>
        <p className="consent-kicker">Flop Club / данные</p>
        <h1 className="consent-title">Согласие на обработку персональных данных</h1>
        <p className="consent-text">
          Чтобы пользоваться приложением, нужно подтвердить согласия на обработку данных и фото-/видеосъемку на
          мероприятиях клуба. Персональные данные обрабатываются по 152-ФЗ, а использование изображения участника
          оформляется с учетом статьи 152.1 ГК РФ.
        </p>

        <div className="consent-doc-grid">
          <button type="button" onClick={() => setDocumentOpen("personal")} className="consent-doc-link tap">
            <FileText className="h-5 w-5" />
            Согласие на обработку данных
          </button>
          <button type="button" onClick={() => setDocumentOpen("photo-video")} className="consent-doc-link tap">
            <Camera className="h-5 w-5" />
            Согласие на фото- и видеосъемку
          </button>
        </div>

        <label className="consent-check tap">
          <input
            type="checkbox"
            checked={personalChecked}
            disabled={personalAlreadyAccepted}
            onChange={(event) => setPersonalChecked(event.target.checked)}
          />
          <span className="consent-check-box" aria-hidden="true">
            {personalChecked && <Check className="h-4 w-4" />}
          </span>
          <span>Я ознакомился и согласен на обработку персональных данных</span>
        </label>

        <label className="consent-check tap">
          <input
            type="checkbox"
            checked={photoVideoChecked}
            disabled={photoVideoAlreadyAccepted}
            onChange={(event) => setPhotoVideoChecked(event.target.checked)}
          />
          <span className="consent-check-box" aria-hidden="true">
            {photoVideoChecked && <Check className="h-4 w-4" />}
          </span>
          <span>Я ознакомился и согласен на фото- и видеосъемку на мероприятиях клуба</span>
        </label>

        <button
          type="button"
          disabled={!canAccept || accept.isPending}
          onClick={() => accept.mutate()}
          className="consent-accept tap"
        >
          {accept.isPending ? "Сохраняем..." : "Подтвердить и продолжить"}
        </button>
      </div>
    </section>
  );
}
