import { useMutation } from "@tanstack/react-query";
import { FormEvent, useMemo, useState } from "react";
import { api } from "../lib/api";
import type { User } from "../types";
import { useToast } from "./Toast";

function suggestedName(user: User) {
  return [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
}

export function NameGate({ user, onSaved }: { user: User; onSaved: (user: User) => void }) {
  const [displayName, setDisplayName] = useState(() => suggestedName(user));
  const { showToast } = useToast();
  const cleanName = useMemo(() => displayName.trim().replace(/\s+/g, " "), [displayName]);
  const canSave = cleanName.length >= 2 && cleanName.length <= 48;

  const save = useMutation({
    mutationFn: () => api.updateProfile({ displayName: cleanName }),
    onSuccess: onSaved,
    onError: (error) => showToast(error.message, "error")
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (canSave) save.mutate();
  }

  return (
    <section className="name-screen">
      <form onSubmit={submit} className="name-card">
        <div className="brand-mark name-mark rounded-full border border-electric/40">
          <img src="/flop-club-logo.jpg" alt="" />
        </div>
        <p className="mt-7 text-[11px] font-bold uppercase tracking-[0.34em] text-electric">Flop Club / Barnaul</p>
        <h1 className="name-title mt-4">Добро пожаловать</h1>
        <p className="mt-5 text-center text-2xl font-black leading-tight text-white">Как к вам обращаться?</p>
        <p className="mt-3 max-w-sm text-center text-sm leading-relaxed text-slate-400">
          Это имя увидит администрация в списках турниров.
        </p>

        <label className="sr-only" htmlFor="display-name">Имя пользователя</label>
        <input
          id="display-name"
          autoFocus
          autoComplete="name"
          inputMode="text"
          maxLength={48}
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          placeholder="Ваше имя"
          className="name-input"
        />

        <button type="submit" disabled={!canSave || save.isPending} className="name-accept tap">
          {save.isPending ? "Сохраняем..." : "Продолжить"}
        </button>
      </form>
    </section>
  );
}
