import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CalendarClock, Camera, ChevronRight, Folder, Images, Mail, Save, Send, Settings } from "lucide-react";
import { Link } from "react-router-dom";
import { RatingBoard } from "../components/RatingBoard";
import { RatingIcon } from "../components/RatingIcon";
import { StatusBadge } from "../components/StatusBadge";
import { useToast } from "../components/Toast";
import type { ClubAward, Registration, User } from "../types";
import { api } from "../lib/api";
import { getNextPlayerStatus, getPlayerStatus, getStatusProgress } from "../lib/playerStatuses";
import { awardImage } from "../lib/tournamentAssets";

type HistoryTab = "active" | "past";

function displayName(user: User) {
  return user.displayName || user.username || [user.firstName, user.lastName].filter(Boolean).join(" ") || "Игрок Flop Club";
}

function avatarFallback(user: User) {
  return displayName(user).slice(0, 1).toUpperCase();
}

function fileToAvatarDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const size = 512;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("Не удалось обработать изображение"));
          return;
        }

        const sourceSize = Math.min(image.width, image.height);
        const sourceX = (image.width - sourceSize) / 2;
        const sourceY = (image.height - sourceSize) / 2;
        context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, size, size);
        resolve(canvas.toDataURL("image/jpeg", 0.86));
      };
      image.onerror = () => reject(new Error("Не удалось открыть изображение"));
      image.src = String(reader.result);
    };
    reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
    reader.readAsDataURL(file);
  });
}

function RegistrationList({ items, emptyText }: { items: Registration[]; emptyText: string }) {
  if (items.length === 0) {
    return <div className="profile-empty">Пусто</div>;
  }

  return (
    <div className="space-y-3">
      {items.map((item) => item.tournament && (
        <Link key={item.id} to={`/tournaments/${item.tournament.id}`} className="glass tap block rounded-[1.25rem] p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-lg font-black">{item.tournament.title}</h3>
              <p className="mt-1 flex items-center gap-2 text-sm text-slate-400">
                <CalendarClock className="h-4 w-4" />
                {new Date(item.tournament.startsAt).toLocaleString("ru-RU")}
              </p>
            </div>
            <StatusBadge status={item.tournament.status} />
          </div>
          {item.tableNumber && item.seatNumber && (
            <p className="mt-3 text-sm font-bold text-electric">Стол {item.tableNumber} · бокс {item.seatNumber}</p>
          )}
        </Link>
      ))}
      {items.length === 0 && <div className="profile-empty">{emptyText}</div>}
    </div>
  );
}

function AwardBadge({ award }: { award: ClubAward }) {
  return (
    <div className={award.unlocked ? "profile-award profile-award-open" : "profile-award"} title={award.title}>
      <img src={awardImage(award.title, award.unlocked)} alt={award.title} />
    </div>
  );
}

function AwardsShelf({ awards }: { awards: ClubAward[] }) {
  const preview = awards.slice(0, 4);
  const hiddenCount = Math.max(0, awards.length - preview.length);

  if (!awards.length) return null;

  return (
    <div className="profile-awards-shelf">
      <div className="profile-awards-row">
        {preview.map((award) => <AwardBadge key={award.title} award={award} />)}
      </div>
      {hiddenCount > 0 && (
        <Link to="/awards" className="profile-awards-more tap" aria-label="Показать все награды">
          <span>{hiddenCount}</span>
          <ChevronRight className="h-7 w-7" />
        </Link>
      )}
    </div>
  );
}

export function ProfilePage({ user, onUserUpdated }: { user: User; onUserUpdated: (user: User) => void }) {
  const { data } = useQuery({ queryKey: ["me", "registrations"], queryFn: api.myRegistrations });
  const { data: awards = [] } = useQuery({ queryKey: ["me", "awards"], queryFn: api.myAwards });
  const [historyTab, setHistoryTab] = useState<HistoryTab>("active");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const [nameEditorOpen, setNameEditorOpen] = useState(false);
  const [displayNameValue, setDisplayNameValue] = useState(displayName(user));
  const [emailEditorOpen, setEmailEditorOpen] = useState(false);
  const [emailValue, setEmailValue] = useState(user.email ?? "");
  const { showToast } = useToast();
  const active = data?.filter((item) => item.status === "ACTIVE") ?? [];
  const past = data?.filter((item) => item.status !== "ACTIVE") ?? [];
  const name = displayName(user);
  const ratingPoints = user.ratingPoints ?? 0;
  const currentStatus = getPlayerStatus(ratingPoints);
  const nextStatus = getNextPlayerStatus(ratingPoints);
  const statusProgress = getStatusProgress(ratingPoints);
  const cleanName = displayNameValue.trim().replace(/\s+/g, " ");
  const canSaveName = cleanName.length >= 2 && cleanName.length <= 48 && cleanName !== name;
  const cleanEmail = emailValue.trim();
  const canSaveEmail = cleanEmail !== (user.email ?? "");

  const updateName = useMutation({
    mutationFn: () => api.updateProfile({ displayName: cleanName }),
    onSuccess: (updatedUser) => {
      onUserUpdated(updatedUser);
      setNameEditorOpen(false);
      setDisplayNameValue(displayName(updatedUser));
      showToast("Имя обновлено");
    },
    onError: (error) => showToast(error.message, "error")
  });

  const updateAvatar = useMutation({
    mutationFn: (photoUrl: string) => api.updateProfile({ photoUrl }),
    onSuccess: (updatedUser) => {
      onUserUpdated(updatedUser);
      setAvatarMenuOpen(false);
      showToast("Аватар обновлён");
    },
    onError: (error) => showToast(error.message, "error")
  });

  const updateEmail = useMutation({
    mutationFn: () => api.updateProfile({ email: cleanEmail || null }),
    onSuccess: (updatedUser) => {
      onUserUpdated(updatedUser);
      setEmailValue(updatedUser.email ?? "");
      setEmailEditorOpen(false);
      showToast(updatedUser.email ? "Email обновлён" : "Email удалён");
    },
    onError: (error) => showToast(error.message, "error")
  });

  async function handleAvatarFile(file?: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showToast("Выберите изображение", "error");
      return;
    }

    try {
      const photoUrl = await fileToAvatarDataUrl(file);
      updateAvatar.mutate(photoUrl);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Не удалось обновить аватар", "error");
    }
  }

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-4xl font-black">Профиль</h1>
      </div>

      <div className="profile-user">
        {user.photoUrl ? (
          <img className="profile-avatar" src={user.photoUrl} alt="" />
        ) : (
          <div className="profile-avatar bg-gradient-to-br from-electric to-violet">{avatarFallback(user)}</div>
        )}
        <div className="min-w-0 flex-1">
          {nameEditorOpen ? (
            <input
              value={displayNameValue}
              onChange={(event) => setDisplayNameValue(event.target.value)}
              maxLength={48}
              className="profile-inline-name-input"
              placeholder="Ваше имя"
              autoFocus
            />
          ) : (
            <>
              <h2 className="truncate text-3xl font-black">{name}</h2>
              <p className="mt-1 text-sm font-bold text-slate-500">{user.role === "ADMIN" ? "Администратор" : "Участник клуба"}</p>
            </>
          )}
        </div>
        {nameEditorOpen && (
          <button
            type="button"
            disabled={!canSaveName || updateName.isPending}
            onClick={() => canSaveName && updateName.mutate()}
            className="profile-inline-save tap"
            aria-label="Сохранить имя"
          >
            <Save className="h-7 w-7" />
          </button>
        )}
        <button
          type="button"
          onClick={() => setSettingsOpen((value) => !value)}
          className="profile-settings-button tap"
          aria-expanded={settingsOpen}
          aria-label="Настройки профиля"
        >
          <Settings className="h-8 w-8" />
        </button>
      </div>

      {settingsOpen && (
        <div className="profile-settings-wrap">
          <button type="button" className="profile-settings-action tap" onClick={() => setAvatarMenuOpen((value) => !value)}>
            Сменить аватар
          </button>
          <button
            type="button"
            className="profile-settings-action tap"
            onClick={() => {
              setDisplayNameValue(name);
              setNameEditorOpen((value) => !value);
            }}
          >
            Сменить имя
          </button>
          {avatarMenuOpen && (
            <div className="avatar-source-menu">
              <label className="avatar-source-option tap">
                <Images className="h-6 w-6" />
                Медиатека
                <input className="sr-only" type="file" accept="image/*" onChange={(event) => handleAvatarFile(event.target.files?.[0])} />
              </label>
              <label className="avatar-source-option tap">
                <Camera className="h-6 w-6" />
                Сделать снимок
                <input className="sr-only" type="file" accept="image/*" capture="user" onChange={(event) => handleAvatarFile(event.target.files?.[0])} />
              </label>
              <label className="avatar-source-option tap">
                <Folder className="h-6 w-6" />
                Выбрать файл
                <input className="sr-only" type="file" accept="image/*" onChange={(event) => handleAvatarFile(event.target.files?.[0])} />
              </label>
            </div>
          )}
        </div>
      )}

      <div className="profile-info-card">
        <p className="profile-info-label">Email</p>
        <div className="profile-info-row">
          {emailEditorOpen ? (
            <>
              <input
                value={emailValue}
                onChange={(event) => setEmailValue(event.target.value)}
                className="profile-email-input"
                inputMode="email"
                autoComplete="email"
                placeholder="email@example.com"
                autoFocus
              />
              <button
                className="profile-edit tap"
                type="button"
                disabled={!canSaveEmail || updateEmail.isPending}
                onClick={() => updateEmail.mutate()}
              >
                Сохранить
              </button>
            </>
          ) : (
            <>
              <span className="profile-chip">
                <Mail className="h-5 w-5" />
                <span className="truncate">{user.email || "Не указан"}</span>
              </span>
              <button
                className="profile-edit tap"
                type="button"
                onClick={() => {
                  setEmailValue(user.email ?? "");
                  setEmailEditorOpen(true);
                }}
              >
                Изменить
              </button>
            </>
          )}
        </div>
      </div>

      <div className="profile-info-card">
        <p className="profile-info-label">Telegram</p>
        <div className="profile-info-row">
          <span className="profile-chip">
            <Send className="h-5 w-5" />
            <span className="truncate">{user.username || user.telegramId}</span>
          </span>
        </div>
      </div>

      <AwardsShelf awards={awards} />

      <div className="profile-status-card">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img className="profile-status-icon" src={currentStatus.icon} alt="" />
            <span className="profile-status-name">{currentStatus.title}</span>
          </div>
          <span className="profile-status-next">{nextStatus?.title ?? "Max"}</span>
        </div>
        <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-rose-500 to-amber-300 shadow-[0_0_24px_rgba(250,204,21,0.65)]"
            style={{ width: `${statusProgress}%` }}
          />
        </div>
        <div className="rating-number mt-5 flex items-center justify-between text-xl">
          <span className="flex items-center gap-2">
            Рейтинг:
            <RatingIcon className="h-7 w-7" />
            {ratingPoints.toLocaleString("ru-RU")}
          </span>
          <span className="flex items-center gap-2 text-slate-500">
            <RatingIcon className="h-6 w-6 opacity-60" />
            {nextStatus ? nextStatus.pointsFrom.toLocaleString("ru-RU") : "MAX"}
          </span>
        </div>
      </div>

      <RatingBoard user={user} />

      <div className="space-y-4">
        <h2 className="text-3xl font-black">История игр</h2>
        <div className="profile-tabs">
          <button className={historyTab === "active" ? "profile-tab profile-tab-active" : "profile-tab"} onClick={() => setHistoryTab("active")} type="button">
            Активные
          </button>
          <button className={historyTab === "past" ? "profile-tab profile-tab-active" : "profile-tab"} onClick={() => setHistoryTab("past")} type="button">
            Прошедшие
          </button>
        </div>
        <RegistrationList items={historyTab === "active" ? active : past} emptyText="Пусто" />
      </div>
    </section>
  );
}
