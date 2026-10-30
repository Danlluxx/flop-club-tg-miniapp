import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ArrowDown, ArrowRight, ArrowUpRight, CalendarDays, Check, ChevronRight, Clock3, Home, MapPin, Search, Trophy, UserRound, Users, X, Zap } from "lucide-react";
import "./preview.css";
import "./hybrid.css";

const hybrid = new URLSearchParams(window.location.search).get("variant") !== "first";

type View = "home" | "events" | "rating" | "profile";
const events = [
  { id: "bomb-pot", title: "BOMB POT", day: "22", weekday: "ЧТ", time: "19:00", price: 500, count: 24, pool: 15000, tag: "Сегодня", description: "Один Bomb Pot на каждом уровне. Все игроки ставят 3 BB и сразу переходят к флопу." },
  { id: "bounty", title: "BOUNTY", day: "23", weekday: "ПТ", time: "19:00", price: 500, count: 18, pool: 10000, tag: "Завтра", description: "Техасский холдем. Дополнительные рейтинговые очки за нокауты участников." },
  { id: "booster-re-entry", title: "BOOSTER RE-ENTRY", day: "24", weekday: "СБ", time: "17:00", price: 500, count: 12, pool: 15000, tag: "Суббота", description: "Турнир с повторными входами до окончания поздней регистрации." },
  { id: "deep-stack", title: "DEEP STACK", day: "25", weekday: "ВС", time: "17:00", price: 500, count: 21, pool: 15000, tag: "Воскресенье", description: "Глубокие стеки и пространство для взвешенных решений. Техасский холдем." }
];
type Event = typeof events[number];
const players = [ ["НиколайДэр", 58637], ["Traktor12", 29890], ["Диана", 23282], ["administración", 22943], ["СпущенКинг", 20295], ["Baldejniy", 20217], ["Nastasy", 19102], ["YuRa", 15806] ] as const;
const nav = [{ id: "home", title: "Главная", icon: Home }, { id: "events", title: "Турниры", icon: CalendarDays }, { id: "rating", title: "Рейтинг", icon: Trophy }, { id: "profile", title: "Профиль", icon: UserRound }] as const;
const number = (value: number) => value.toLocaleString("ru-RU");

function App() {
  const [view, setView] = useState<View>("home");
  const [selected, setSelected] = useState<Event | null>(null);
  const [registered, setRegistered] = useState<string[]>([]);
  const [filter, setFilter] = useState("week");
  const [scope, setScope] = useState("season");
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (selected) dialog.current?.showModal(); else dialog.current?.close(); }, [selected]);
  useEffect(() => { if (!notice) return; const id = setTimeout(() => setNotice(""), 3500); return () => clearTimeout(id); }, [notice]);
  function go(next: View) { setView(next); window.scrollTo({ top: 0 }); }
  function toggleRegistration(event: Event) {
    const exists = registered.includes(event.id);
    setRegistered(current => exists ? current.filter(id => id !== event.id) : [...current, event.id]);
    setNotice(exists ? "Тестовая запись отменена" : "Тестовая запись оформлена");
  }
  function eventRow(event: Event) {
    return <button className="event-row" key={event.id} onClick={() => setSelected(event)}><span className="date-block"><b>{event.day}</b><small>{event.weekday} / ОКТ</small></span><span className="event-info"><strong>{event.title}</strong><span>{event.time} <i /> {event.price} ₽ <i /> {registered.includes(event.id) ? "Вы записаны" : `${event.count} / 40 игроков`}</span></span><ArrowUpRight size={18} /></button>;
  }
  function leaderboard(compact = false) {
    const shown = players.filter(([name]) => name.toLowerCase().includes(search.toLowerCase())).slice(0, compact ? 4 : 8);
    return <div className="leaderboard">{shown.map(([name, points], index) => <div className={`leader-row ${index === 0 ? "first" : ""}`} key={name}><span className="rank">{String(players.findIndex(p => p[0] === name) + 1).padStart(2, "0")}</span><span className={`initial initial-${index % 4}`}>{name.slice(0, 1)}</span><strong>{name}</strong><span className="points">{number(scope === "season" ? points : points + 24000)}<Zap size={13} /></span></div>)}{!shown.length && <p className="empty">Игроков с таким именем нет</p>}</div>;
  }
  return <div className={`preview ${hybrid ? "hybrid" : ""}`}><div className="preview-label"><a href={hybrid ? "?variant=first" : "?variant=hybrid"}>{hybrid ? "ВАРИАНТ 02 · СРАВНИТЬ С ПЕРВЫМ ↗" : "ВАРИАНТ 01 · ОТКРЫТЬ НОВЫЙ ↗"}</a><span>Демонстрационные данные</span></div>
    <header className="masthead"><button className="brand" onClick={() => go("home")} aria-label="FLOP CLUB, главная"><img src="/flop-club-logo.jpg" alt="FLOP CLUB" /></button><span className="club-city"><MapPin size={13} /> Барнаул</span><button className="account" onClick={() => go("profile")} aria-label="Открыть профиль">Д</button></header>
    <main>
      {view === "home" && <>
        {hybrid ? <button className="home-identity" onClick={() => go("profile")} aria-label="Диана, открыть профиль"><span className="identity-avatar">Д<img src="/statuses/finalist.png" alt="" /></span><span className="identity-main"><span className="identity-top"><strong>Диана</strong><span>23 282 <Zap size={14} /></span></span><span className="identity-progress"><span /></span><span className="identity-bottom"><b>FINALIST</b><small>До BLACK STACK · 16 718</small></span></span><ChevronRight size={16} /></button> : <div className="welcome"><div><span className="eyebrow">ВАША ИГРА. ВАША ИСТОРИЯ.</span><h1>На шаг выше.</h1></div><span className="edition">FLOP<br />CLUB / 22</span></div>}
        <button className="player-strip" onClick={() => go("profile")}><img src="/statuses/finalist.png" alt="" /><span><small>Ваш статус</small><strong>FINALIST</strong></span><span className="player-score">23 282 <Zap size={15} /></span><ChevronRight size={16} /></button>
        <section className="feature"><img className="feature-art" src="/events/flop-bomb-pot.jpg" alt="Эмблема турнира Bomb Pot" /><div className="feature-shade" /><div className="feature-content"><div className="feature-top"><span className="live"><span /> СЕГОДНЯ В КЛУБЕ</span><span>22 ОКТ / 19:00</span></div><div className="feature-title"><span>FLOP</span><h2>BOMB<br />POT<span className="red-dot">.</span></h2></div><div className="feature-bottom"><span><Users size={15} /> {24 + Number(registered.includes("bomb-pot"))} / 40 игроков</span><span>Вход <b>500 ₽</b></span></div></div></section>
        <div className="event-action"><span><Zap size={16} /><span><small>Рейтинговый пул</small><strong>15 000 очков</strong></span></span><button className="primary" onClick={() => setSelected(events[0])}>{registered.includes("bomb-pot") ? "Вы записаны" : "Участвовать"}<ArrowRight size={18} /></button></div>
        <section className="section"><div className="section-heading"><h2>Дальше по плану</h2><button onClick={() => go("events")} aria-label="Все турниры"><ArrowUpRight size={21} /></button></div>{events.slice(1, 3).map(eventRow)}</section>
        <section className="section"><div className="section-heading"><h2>Лидеры сезона</h2><button onClick={() => go("rating")}>Весь рейтинг <ArrowRight size={16} /></button></div>{leaderboard(true)}</section>
        <a className="address" href="https://yandex.ru/maps/?text=Барнаул%20Геблера%2033б" target="_blank" rel="noreferrer"><MapPin size={20} /><span><small>Встречаемся за столом</small><strong>Геблера, 33Б · Барнаул</strong></span><ArrowUpRight size={18} /></a>
      </>}
      {view === "events" && <><div className="page-heading"><span className="eyebrow">FLOP CLUB / КАЛЕНДАРЬ</span><h1>Твоя следующая игра.</h1><p>22–25 октября <span>2026</span></p></div><div className="toolbar"><h2>Турниры <small>04</small></h2><select aria-label="Период турниров" value={filter} onChange={e => setFilter(e.target.value)}><option value="week">Эта неделя</option><option value="today">Сегодня</option><option value="mine">Мои записи</option></select></div><div className="event-list">{events.filter(event => filter === "today" ? event === events[0] : filter === "mine" ? registered.includes(event.id) : true).map(event => <article className="event-item" key={event.id}><button className="event-image" onClick={() => setSelected(event)} aria-label={`Открыть ${event.title}`}><img src={`/events/flop-${event.id}.jpg`} alt={event.title} /><span>{event.tag} · {event.time}</span></button>{eventRow(event)}<div className="event-foot"><span><Zap size={14} /> {number(event.pool)} очков</span><button onClick={() => setSelected(event)}>Подробнее <ArrowRight size={16} /></button></div></article>)}</div>{filter === "mine" && !registered.length && <p className="empty">У вас пока нет записей на турниры.</p>}</>}
      {view === "rating" && <><div className="page-heading"><span className="eyebrow">КАЖДАЯ ИГРА ИМЕЕТ ЗНАЧЕНИЕ</span><h1>Рейтинг клуба.</h1><p>{scope === "season" ? "Октябрь – ноябрь 2026" : "За всё время"}</p></div><div className="tabs" role="tablist" aria-label="Тип рейтинга"><button role="tab" aria-selected={scope === "season"} onClick={() => setScope("season")}>Сезонный</button><button role="tab" aria-selected={scope === "global"} onClick={() => setScope("global")}>Глобальный</button></div><div className="your-rank"><span><small>Ваше место</small><b>03<span>/ 218</span></b></span><span><small>Ваш рейтинг</small><b>{number(scope === "season" ? 23282 : 47282)} <Zap size={18} /></b></span><Trophy className="rank-trophy" size={38} /></div><label className="search"><Search size={18} /><input placeholder="Найти игрока" aria-label="Найти игрока" value={search} onChange={e => setSearch(e.target.value)} />{search && <button onClick={() => setSearch("")} aria-label="Очистить поиск"><X size={16} /></button>}</label><div className="table-caption"><span>МЕСТО / ИГРОК</span><span>ОЧКИ <ArrowDown size={12} /></span></div>{leaderboard()}</>}
      {view === "profile" && <><div className="page-heading"><span className="eyebrow">ЛИЧНЫЙ КАБИНЕТ</span><h1>Твоя история.</h1></div><section className="profile-identity"><div className="profile-avatar">Д</div><h2>Диана</h2><span>@badulinadiana</span></section><div className="status-panel"><img src="/statuses/finalist.png" alt="Статус Finalist" /><div><span className="eyebrow">ТЕКУЩИЙ СТАТУС</span><h2>FINALIST</h2></div><b>23 282<Zap size={14} /></b></div><div className="progress-label"><span>До BLACK STACK</span><b>16 718 очков</b></div><progress max={40000} value={23282} /><div className="stats"><span><b>18</b><small>Турниров</small></span><span><b>3</b><small>Победы</small></span><span><b>03</b><small>В сезоне</small></span></div><section className="section"><div className="section-heading"><h2>Твои трофеи</h2><span className="muted">3 / 19</span></div><div className="awards">{["bounty", "chip-leader", "mystery-knockout"].map((slug, i) => <figure key={slug}><img src={`/awards/color/flop-${slug}.png`} alt={['Bounty', 'Chip Leader', 'Mystery Knockout'][i]} /><figcaption>{['Bounty', 'Chip Leader', 'Mystery Knockout'][i]}</figcaption></figure>)}</div></section><section className="section"><div className="section-heading"><h2>Мои турниры</h2><CalendarDays size={18} /></div>{registered.length ? events.filter(event => registered.includes(event.id)).map(eventRow) : <p className="empty">Следующая история начинается за столом.<button onClick={() => go("events")}>Выбрать турнир <ArrowRight size={16} /></button></p>}</section></>}
      <footer>FLOP CLUB <span>Покер не на деньги. Игра на рейтинг.</span></footer>
    </main>
    <nav className="navigation" aria-label="Основная навигация">{nav.map(({id,title,icon:Icon}) => <button key={id} aria-current={view === id ? "page" : undefined} onClick={() => go(id)}><Icon size={21} strokeWidth={1.7} /><span>{title}</span></button>)}</nav>
    <dialog ref={dialog} onCancel={() => setSelected(null)} onClick={e => { if (e.target === dialog.current) setSelected(null); }} aria-labelledby="event-title">{selected && <div className="dialog-content"><div className="dialog-header"><span>FLOP CLUB / ТУРНИР</span><button autoFocus onClick={() => setSelected(null)} aria-label="Закрыть"><X size={22} /></button></div><img className="dialog-art" src={`/events/flop-${selected.id}.jpg`} alt="" /><h2 id="event-title">{selected.title}</h2><div className="dialog-date"><CalendarDays size={16} />{selected.day} октября <Clock3 size={16} />{selected.time}</div><p>{selected.description}</p><div className="terms"><span>Вход<strong>{selected.price} ₽</strong></span><span>Рейтинговый пул<strong>{number(selected.pool)}</strong></span><span>Свободных мест<strong>{40 - selected.count - Number(registered.includes(selected.id))}</strong></span></div><button className={`primary dialog-cta ${registered.includes(selected.id) ? "cancel" : ""}`} onClick={() => toggleRegistration(selected)}>{registered.includes(selected.id) ? <><Check size={18} />Вы записаны · Отменить</> : <>Записаться на турнир<ArrowRight size={18} /></>}</button><small className="demo-note">Демо: запись сохраняется только в этом превью.</small></div>}</dialog>
    {notice && <div className="toast" role="status"><Check size={16} />{notice}</div>}
  </div>;
}
createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
