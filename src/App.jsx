import React, { useEffect, useMemo, useState } from "react";
import {
  CATEGORIES,
  WEEKDAYS,
  dateKey,
  parseDate,
  monthGrid,
  moveMonth,
  sortEvents,
  validateEvent,
} from "./calendar.js";
import { Icon, Modal } from "./ui.jsx";
import { api } from "./api.js";

const fullDate = (date) =>
  `${date.getMonth() + 1}月${date.getDate()}日（${WEEKDAYS[date.getDay()]}）`;
const timeRange = (event) =>
  event.end ? `${event.start}〜${event.end}` : event.start;

function EventForm({ initial, onSave, onClose }) {
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState("");
  const [saving, setSaving] = useState(false);
  const editing = Boolean(initial.id);
  const change = (key, value) => {
    setForm((previous) => ({ ...previous, [key]: value }));
    setErrors((previous) => ({ ...previous, [key]: "" }));
  };
  async function submit(event) {
    event.preventDefault();
    const nextErrors = validateEvent(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      document.getElementById(`event-${Object.keys(nextErrors)[0]}`)?.focus();
      return;
    }
    setSaving(true);
    setServerError("");
    try {
      await onSave({
        ...form,
        title: form.title.trim(),
        location: form.location.trim(),
      });
    } catch (error) {
      setServerError(error.message);
      setSaving(false);
    }
  }
  const input = (key, label, type = "text", options = {}) => (
    <div className="field">
      <label className="field-label" htmlFor={`event-${key}`}>
        {label}
        {["title", "date", "start"].includes(key) && (
          <span className="required-mark">必須</span>
        )}
      </label>
      <input
        className="field-input"
        id={`event-${key}`}
        type={type}
        value={form[key]}
        onChange={(event) => change(key, event.target.value)}
        aria-invalid={Boolean(errors[key])}
        aria-describedby={errors[key] ? `error-${key}` : undefined}
        disabled={saving}
        {...options}
      />
      {errors[key] && (
        <span className="field-error" id={`error-${key}`} role="alert">
          {errors[key]}
        </span>
      )}
    </div>
  );
  return (
    <Modal titleId="event-form-title" onClose={onClose} busy={saving}>
      <div className="modal-header">
        <div>
          <span className="modal-eyebrow">日々に、新しい予定を。</span>
          <h2 className="modal-title" id="event-form-title">
            {editing ? "予定を編集" : "予定を追加"}
          </h2>
        </div>
        <button
          type="button"
          className="icon-button modal-close"
          aria-label="閉じる"
          onClick={onClose}
          disabled={saving}
        >
          <Icon name="close" />
        </button>
      </div>
      <form className="event-form" onSubmit={submit} noValidate>
        {input("title", "予定名", "text", {
          placeholder: "どんな予定ですか？",
          maxLength: 80,
        })}
        <fieldset className="field category-field">
          <legend className="field-label">
            種類<span className="required-mark">必須</span>
          </legend>
          <div className="category-options">
            {Object.entries(CATEGORIES).map(([key, category]) => (
              <button
                key={key}
                type="button"
                className={`category-option ${category.className} ${form.category === key ? "is-selected" : ""}`}
                aria-pressed={form.category === key}
                onClick={() => change("category", key)}
                disabled={saving}
              >
                <Icon name={category.icon} size={18} />
                {category.label}
                {form.category === key && <Icon name="check" size={14} />}
              </button>
            ))}
          </div>
        </fieldset>
        {input("date", "日付", "date", {
          min: "1900-01-01",
          max: "9999-12-31",
        })}
        <div className="form-row">
          {input("start", "開始時間", "time")}
          {input("end", "終了時間", "time")}
        </div>
        {input("location", "場所", "text", {
          placeholder: "会場名や住所など（任意）",
          maxLength: 120,
        })}
        <p className="draft-note">
          <Icon name="leaf" size={15} />
          予定はいつでも編集できます。
        </p>
        {serverError && (
          <div className="form-error" role="alert">
            {serverError}
          </div>
        )}
        <div className="form-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={onClose}
            disabled={saving}
          >
            キャンセル
          </button>
          <button type="submit" className="primary-button" disabled={saving}>
            <Icon name={editing ? "check" : "plus"} size={18} />
            {saving ? "保存中…" : editing ? "変更を保存" : "予定を登録"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function EmptyState({
  title = "まだ予定がありません",
  description = "ゆっくり過ごす日も、大切な一日。",
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon name="sun" size={28} />
      </span>
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  );
}

export default function CalendarApp({
  user,
  onLogout,
  logoutBusy,
  logoutError,
}) {
  const [today] = useState(() => new Date());
  const todayKey = dateKey(today);
  const [month, setMonth] = useState(
    () => new Date(today.getFullYear(), today.getMonth(), 1, 12),
  );
  const [selected, setSelected] = useState(todayKey);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reload, setReload] = useState(0);
  const [filters, setFilters] = useState(["live", "medical", "other"]);
  const [view, setView] = useState("month");
  const [dialog, setDialog] = useState(null);
  const [toast, setToast] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const visibleEvents = useMemo(
    () =>
      sortEvents(events.filter((event) => filters.includes(event.category))),
    [events, filters],
  );
  const days = useMemo(() => monthGrid(month), [month]);
  const selectedDate = parseDate(selected);
  const selectedEvents = visibleEvents.filter(
    (event) => event.date === selected,
  );
  const monthPrefix = dateKey(month).slice(0, 7);
  const monthEvents = visibleEvents.filter((event) =>
    event.date.startsWith(monthPrefix),
  );
  const upcomingEvents = visibleEvents.filter(
    (event) => event.date >= todayKey,
  );
  const listEvents = view === "upcoming" ? upcomingEvents : monthEvents;
  const grouped = Object.groupBy(listEvents, (event) => event.date);
  const detailEvent = dialog?.id
    ? events.find((event) => event.id === dialog.id)
    : null;

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError("");
    api("/events", { signal: controller.signal })
      .then((data) => {
        setEvents(sortEvents(data));
        setLoading(false);
      })
      .catch((error) => {
        if (error.name !== "AbortError") {
          setLoadError(error.message);
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [reload]);
  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(timeout);
  }, [toast]);
  useEffect(() => {
    const shortcut = (event) => {
      if (event.key === "Escape") setMenuOpen(false);
      if (
        event.key.toLowerCase() === "n" &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !dialog &&
        !loading &&
        !loadError &&
        !["INPUT", "TEXTAREA", "SELECT"].includes(
          document.activeElement?.tagName,
        ) &&
        !document.activeElement?.isContentEditable
      ) {
        event.preventDefault();
        openCreate(selected);
      }
    };
    document.addEventListener("keydown", shortcut);
    return () => document.removeEventListener("keydown", shortcut);
  }, [dialog, loading, loadError, selected]);

  function openCreate(date = selected) {
    setDialog({
      type: "form",
      initial: {
        title: "",
        date,
        start: "10:00",
        end: "11:00",
        category: "other",
        location: "",
      },
    });
  }
  function chooseDate(date, changeVisibleMonth = false) {
    setSelected(dateKey(date));
    if (changeVisibleMonth)
      setMonth(new Date(date.getFullYear(), date.getMonth(), 1, 12));
  }
  function showToday() {
    chooseDate(today, true);
  }
  function changeMonth(offset) {
    const next = moveMonth(month, offset);
    if (next.getFullYear() < 1900 || next.getFullYear() > 9999) return;
    setMonth(next);
    setSelected(dateKey(next));
  }
  async function saveEvent(form) {
    const { id, ...body } = form;
    const saved = await api(
      id ? `/events/${encodeURIComponent(id)}` : "/events",
      { method: id ? "PUT" : "POST", body: JSON.stringify(body) },
    );
    setEvents((previous) =>
      sortEvents(
        id
          ? previous.map((event) => (event.id === id ? saved : event))
          : [...previous, saved],
      ),
    );
    chooseDate(parseDate(saved.date), true);
    setFilters((previous) =>
      previous.includes(saved.category)
        ? previous
        : [...previous, saved.category],
    );
    setDialog(null);
    setToast(id ? "予定を更新しました。" : "新しい予定を登録しました。");
  }
  async function deleteEvent() {
    setDeleting(true);
    setDeleteError("");
    try {
      await api(`/events/${encodeURIComponent(detailEvent.id)}`, {
        method: "DELETE",
      });
      setEvents((previous) =>
        previous.filter((event) => event.id !== detailEvent.id),
      );
      setDialog(null);
      setToast("予定を削除しました。");
    } catch (error) {
      setDeleteError(error.message);
    } finally {
      setDeleting(false);
    }
  }
  const openDetails = (event) => setDialog({ type: "detail", id: event.id });
  const toggleFilter = (key) =>
    setFilters((previous) =>
      previous.includes(key)
        ? previous.filter((value) => value !== key)
        : [...previous, key],
    );
  const unavailable = loading || Boolean(loadError);

  return (
    <div className="app-shell">
      {menuOpen && (
        <button
          className="sidebar-overlay"
          aria-label="メニューを閉じる"
          onClick={() => setMenuOpen(false)}
        />
      )}
      <aside
        className={`sidebar ${menuOpen ? "is-open" : ""}`}
        aria-label="サイドメニュー"
        inert={Boolean(dialog)}
      >
        <a
          className="brand"
          href="#"
          onClick={(event) => {
            event.preventDefault();
            setView("month");
            showToday();
            setMenuOpen(false);
          }}
        >
          <span className="brand-mark">
            <Icon name="calendar" size={25} />
          </span>
          <span>
            <span className="brand-name">
              日々の予定
              <span className="brand-caption">わたしの、小さなカレンダー</span>
            </span>
          </span>
        </a>
        <div className="sidebar-section-label">マイスペース</div>
        <nav className="sidebar-nav">
          <button
            className={`nav-item ${view !== "upcoming" ? "is-active" : ""}`}
            aria-current={view !== "upcoming" ? "page" : undefined}
            onClick={() => {
              setView("month");
              setMenuOpen(false);
            }}
          >
            <Icon name="calendar" />
            <span>カレンダー</span>
          </button>
          <button
            className={`nav-item ${view === "upcoming" ? "is-active" : ""}`}
            aria-current={view === "upcoming" ? "page" : undefined}
            onClick={() => {
              setView("upcoming");
              setMenuOpen(false);
            }}
          >
            <Icon name="list" />
            <span>これからの予定</span>
            <span className="nav-count">{upcomingEvents.length}</span>
          </button>
        </nav>
        <div className="mini-calendar">
          <div className="mini-calendar-heading">
            <span>
              {month.getFullYear()}年 {month.getMonth() + 1}月
            </span>
            <div>
              <button
                className="icon-button"
                aria-label="ミニカレンダーの前の月"
                onClick={() => changeMonth(-1)}
              >
                <Icon name="left" size={14} />
              </button>
              <button
                className="icon-button"
                aria-label="ミニカレンダーの次の月"
                onClick={() => changeMonth(1)}
              >
                <Icon name="right" size={14} />
              </button>
            </div>
          </div>
          <div className="mini-calendar-grid">
            {WEEKDAYS.map((day) => (
              <span className="mini-weekday" key={day}>
                {day}
              </span>
            ))}
            {days.map((date) => (
              <button
                key={dateKey(date)}
                aria-label={`${date.getFullYear()}年${fullDate(date)}を選択`}
                aria-pressed={dateKey(date) === selected}
                className={`mini-day ${dateKey(date) === todayKey ? "is-today" : ""} ${dateKey(date) === selected ? "is-selected" : ""} ${date.getMonth() !== month.getMonth() ? "is-muted" : ""}`}
                onClick={() => {
                  chooseDate(date, true);
                  setView("month");
                  setMenuOpen(false);
                }}
              >
                {date.getDate()}
              </button>
            ))}
          </div>
        </div>
        <div className="sidebar-section-label">予定の種類</div>
        <div className="category-list">
          {Object.entries(CATEGORIES).map(([key, category]) => (
            <button
              key={key}
              className={`category-toggle ${category.className} ${filters.includes(key) ? "is-active" : ""}`}
              aria-pressed={filters.includes(key)}
              onClick={() => toggleFilter(key)}
            >
              <span className="category-dot">
                {filters.includes(key) && <Icon name="check" size={10} />}
              </span>
              <span>{category.label}</span>
              <span className="category-count">
                {
                  events.filter(
                    (event) =>
                      event.category === key &&
                      event.date.startsWith(monthPrefix),
                  ).length
                }
              </span>
            </button>
          ))}
        </div>
        <div className="sidebar-note">
          <span className="note-icon">
            <Icon name="leaf" size={27} />
          </span>
          <strong>心に、ちょっと余白を。</strong>
          <p>
            楽しみな予定をひとつ。
            <br />
            自分らしい毎日を、ここから。
          </p>
        </div>
        <div className="sidebar-footer">
          <span className="avatar">{Array.from(user.name)[0]}</span>
          <div className="user-info">
            <span className="user-name" title={user.name}>
              {user.name}
            </span>
            <span className="user-role" title={user.username}>
              @{user.username}
            </span>
          </div>
          <Icon name="leaf" size={17} />
        </div>
      </aside>
      <main className="main" inert={Boolean(dialog)}>
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu-button"
              aria-label="メニューを開く"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(true)}
            >
              <Icon name="menu" />
            </button>
            <span>マイスペース</span>
            <Icon name="right" size={12} />
            <span className="breadcrumb-current">
              {view === "upcoming" ? "これからの予定" : "カレンダー"}
            </span>
          </div>
          <div className="topbar-actions">
            <button
              type="button"
              className="logout-button"
              onClick={onLogout}
              disabled={logoutBusy}
            >
              <Icon name="logout" size={16} />
              {logoutBusy ? "ログアウト中…" : "ログアウト"}
            </button>
            <span className="topbar-today">
              {today.getFullYear()}年{fullDate(today)}
            </span>
            <button
              className="icon-button"
              aria-label="使い方を見る"
              onClick={() => setDialog({ type: "help" })}
            >
              <Icon name="help" size={20} />
            </button>
          </div>
        </header>
        <div className="page-content">
          <section className="page-heading">
            <div className="heading-copy">
              <span className="eyebrow">毎日を、あなたらしく。</span>
              <div className="title-row">
                <h1 className="page-title">
                  {view === "upcoming" ? "これからの予定" : "カレンダー"}
                </h1>
                <span className="heading-flower" aria-hidden="true">
                  ✳
                </span>
              </div>
              <p className="heading-description">
                大切な予定も、楽しみな約束も。この場所に。
              </p>
            </div>
            <button
              className="primary-button"
              onClick={() => openCreate()}
              disabled={unavailable}
            >
              <Icon name="plus" size={19} />
              予定を追加
            </button>
          </section>
          {logoutError && (
            <div className="error-banner" role="alert">
              {logoutError}
            </div>
          )}
          {loadError && (
            <div className="error-banner" role="alert">
              <p>{loadError}</p>
              <button
                className="secondary-button"
                onClick={() => setReload((value) => value + 1)}
              >
                再読み込み
              </button>
            </div>
          )}
          <section className="month-toolbar" aria-label="カレンダーの表示設定">
            <div className="month-controls">
              {view === "upcoming" ? (
                <h2 className="month-title">
                  今日以降の予定 <span>・{upcomingEvents.length}件</span>
                </h2>
              ) : (
                <>
                  <h2 className="month-title">
                    {month.getFullYear()}
                    <span>年</span> {month.getMonth() + 1}
                    <span>月</span>
                  </h2>
                  <div className="month-arrows">
                    <button
                      className="icon-button month-arrow"
                      aria-label="前の月"
                      onClick={() => changeMonth(-1)}
                    >
                      <Icon name="left" size={18} />
                    </button>
                    <button
                      className="icon-button month-arrow"
                      aria-label="次の月"
                      onClick={() => changeMonth(1)}
                    >
                      <Icon name="right" size={18} />
                    </button>
                  </div>
                  <button className="today-button" onClick={showToday}>
                    今日
                  </button>
                </>
              )}
            </div>
            <div className="view-switch" aria-label="表示方法">
              <button
                className={`view-option ${view === "month" ? "is-active" : ""}`}
                aria-pressed={view === "month"}
                onClick={() => setView("month")}
              >
                <Icon name="grid" size={14} />
                月表示
              </button>
              <button
                className={`view-option ${view !== "month" ? "is-active" : ""}`}
                aria-pressed={view !== "month"}
                onClick={() => setView("list")}
              >
                <Icon name="list" size={15} />
                一覧表示
              </button>
            </div>
          </section>
          <div className="workspace" aria-busy={loading}>
            <section
              className="calendar-card"
              aria-label={`${month.getFullYear()}年${month.getMonth() + 1}月の予定`}
            >
              {view === "month" ? (
                <>
                  <div className="calendar-weekdays">
                    {WEEKDAYS.map((day, index) => (
                      <span
                        key={day}
                        className={`weekday ${index === 0 ? "is-sunday" : index === 6 ? "is-saturday" : ""}`}
                      >
                        {day}
                      </span>
                    ))}
                  </div>
                  <div className="calendar-grid">
                    {days.map((date) => {
                      const key = dateKey(date),
                        items = visibleEvents.filter(
                          (event) => event.date === key,
                        );
                      return (
                        <div
                          key={key}
                          className={`calendar-cell ${date.getMonth() !== month.getMonth() ? "is-outside" : ""} ${key === todayKey ? "is-today" : ""} ${key === selected ? "is-selected" : ""} ${date.getDay() === 0 ? "is-sunday" : date.getDay() === 6 ? "is-saturday" : ""}`}
                          onClick={() => chooseDate(date)}
                        >
                          <div className="day-top">
                            <button
                              className="day-number"
                              aria-label={`${fullDate(date)}の予定を表示`}
                              aria-pressed={key === selected}
                              aria-current={
                                key === todayKey ? "date" : undefined
                              }
                              onClick={() => chooseDate(date)}
                            >
                              {date.getDate()}
                            </button>
                            <button
                              className="day-add"
                              aria-label={`${fullDate(date)}に予定を追加`}
                              onClick={(event) => {
                                event.stopPropagation();
                                chooseDate(date);
                                openCreate(key);
                              }}
                              disabled={unavailable}
                            >
                              <Icon name="plus" size={13} />
                            </button>
                          </div>
                          <div className="cell-events">
                            {items.slice(0, 2).map((event) => (
                              <button
                                key={event.id}
                                className={`event-chip ${CATEGORIES[event.category].className}`}
                                onClick={(click) => {
                                  click.stopPropagation();
                                  chooseDate(date);
                                  openDetails(event);
                                }}
                                title={`${event.start} ${event.title}（${CATEGORIES[event.category].label}）`}
                              >
                                <span className="event-time">
                                  {event.start}
                                </span>
                                <span className="event-title">
                                  {event.title}
                                </span>
                              </button>
                            ))}
                            {items.length > 2 && (
                              <button
                                className="event-overflow"
                                onClick={() => chooseDate(date)}
                              >
                                ほか{items.length - 2}件
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="list-view">
                  {Object.entries(grouped).map(([date, items]) => (
                    <div className="list-group" key={date}>
                      <h3 className="list-date">
                        {fullDate(parseDate(date))}
                        {date === todayKey && <span>今日</span>}
                      </h3>
                      <div className="list-events">
                        {items.map((event) => (
                          <button
                            className={`list-event ${CATEGORIES[event.category].className}`}
                            key={event.id}
                            onClick={() => {
                              chooseDate(parseDate(date), true);
                              openDetails(event);
                            }}
                          >
                            <span className="list-event-time">
                              {event.start}
                            </span>
                            <span className="category-dot" />
                            <span className="list-event-title">
                              {event.title}
                              <small>{CATEGORIES[event.category].label}</small>
                            </span>
                            <span className="list-event-location">
                              <Icon name="pin" size={14} />
                              {event.location || "場所未定"}
                            </span>
                            <Icon name="right" size={15} />
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                  {!listEvents.length && !loading && !loadError && (
                    <EmptyState
                      title={
                        filters.length
                          ? "予定はまだありません"
                          : "すべての種類が非表示です"
                      }
                      description={
                        filters.length
                          ? "新しい予定を登録してみましょう。"
                          : "左の「予定の種類」で表示を切り替えられます。"
                      }
                    />
                  )}
                </div>
              )}
              {loading && (
                <div className="loading-state" role="status">
                  予定を読み込んでいます…
                </div>
              )}
            </section>
            <aside className="agenda-panel" aria-label="選択した日の予定">
              <div className="agenda-header">
                <span className="agenda-eyebrow">
                  {selected === todayKey ? "今日の予定" : "この日の予定"}
                  <span className="agenda-count">
                    {selectedEvents.length}件
                  </span>
                </span>
                <h2 className="agenda-date">
                  {selectedDate.getMonth() + 1}月{selectedDate.getDate()}日
                  <span>{WEEKDAYS[selectedDate.getDay()]}曜日</span>
                </h2>
              </div>
              <div className="agenda-events">
                {selectedEvents.map((event) => (
                  <button
                    className={`agenda-event ${CATEGORIES[event.category].className}`}
                    key={event.id}
                    onClick={() => openDetails(event)}
                  >
                    <span className="agenda-event-time">
                      {event.start}
                      <span>{event.end}</span>
                    </span>
                    <span className="agenda-event-dot" />
                    <span className="agenda-event-body">
                      <span className="agenda-event-category">
                        {CATEGORIES[event.category].label}
                      </span>
                      <strong className="agenda-event-name">
                        {event.title}
                      </strong>
                      <span className="agenda-event-location">
                        <Icon name="pin" size={12} />
                        {event.location || "場所未定"}
                      </span>
                    </span>
                  </button>
                ))}
                {!selectedEvents.length && !loading && !loadError && (
                  <EmptyState
                    title={
                      filters.length ? "予定のない一日" : "予定が非表示です"
                    }
                    description={
                      filters.length
                        ? "自分のための時間を、少し。"
                        : "種類のフィルターを確認してください。"
                    }
                  />
                )}
              </div>
              <button
                className="agenda-add"
                onClick={() => openCreate(selected)}
                disabled={unavailable}
              >
                <Icon name="plus" size={17} />
                この日に予定を追加
              </button>
              <div className="agenda-bottom-note">
                <Icon name="sun" size={18} />
                <span>今日も、いい一日になりますように。</span>
              </div>
            </aside>
          </div>
          <section className="upcoming-section">
            <div className="section-heading">
              <div>
                <h2 className="section-title">もうすぐの楽しみ</h2>
                <p className="section-caption">
                  これからの予定を、ひと足先に。
                </p>
              </div>
              <button
                className="text-button"
                onClick={() => setView("upcoming")}
              >
                すべて見る
                <Icon name="arrow" size={16} />
              </button>
            </div>
            <div className="upcoming-grid">
              {upcomingEvents.slice(0, 3).map((event) => {
                const date = parseDate(event.date);
                return (
                  <button
                    className={`upcoming-card ${CATEGORIES[event.category].className}`}
                    key={event.id}
                    onClick={() => {
                      chooseDate(date, true);
                      openDetails(event);
                    }}
                  >
                    <span className="upcoming-date">
                      <span className="upcoming-month">
                        {date.getMonth() + 1}月
                      </span>
                      <span className="upcoming-day">{date.getDate()}</span>
                      <span className="upcoming-weekday">
                        {WEEKDAYS[date.getDay()]}曜日
                      </span>
                    </span>
                    <span className="upcoming-details">
                      <span className="upcoming-category">
                        <Icon
                          name={CATEGORIES[event.category].icon}
                          size={12}
                        />
                        {CATEGORIES[event.category].label}
                      </span>
                      <strong className="upcoming-title">{event.title}</strong>
                      <span className="upcoming-meta">
                        <Icon name="clock" size={12} />
                        {timeRange(event)}
                      </span>
                      <span className="upcoming-location">
                        <Icon name="pin" size={12} />
                        {event.location || "場所未定"}
                      </span>
                    </span>
                    <Icon className="upcoming-arrow" name="right" size={15} />
                  </button>
                );
              })}
            </div>
            {!upcomingEvents.length && !loading && !loadError && (
              <div className="upcoming-empty">
                これからの予定はまだありません。次の楽しみを登録してみませんか。
              </div>
            )}
          </section>
          <footer className="page-footer">
            <span>
              <span className="footer-dot" />
              {user.name}さんの予定を保存しています
            </span>
            <span>小さな予定から、心地よい毎日を。</span>
          </footer>
        </div>
      </main>
      {dialog?.type === "form" && (
        <EventForm
          key={dialog.initial.id || dialog.initial.date}
          initial={dialog.initial}
          onSave={saveEvent}
          onClose={() => setDialog(null)}
        />
      )}
      {detailEvent && ["detail", "delete"].includes(dialog?.type) && (
        <Modal
          titleId="detail-title"
          onClose={() => setDialog(null)}
          busy={deleting}
        >
          <div className="modal-header">
            <div>
              <span
                className={`detail-category ${CATEGORIES[detailEvent.category].className}`}
              >
                {CATEGORIES[detailEvent.category].label}
              </span>
              <h2 className="modal-title" id="detail-title">
                {dialog.type === "delete"
                  ? "この予定を削除しますか？"
                  : detailEvent.title}
              </h2>
            </div>
            <button
              className="icon-button"
              aria-label="閉じる"
              onClick={() => setDialog(null)}
              disabled={deleting}
            >
              <Icon name="close" />
            </button>
          </div>
          <div className="modal-body">
            {dialog.type === "delete" ? (
              <p className="delete-description">
                「{detailEvent.title}」を削除します。この操作は取り消せません。
              </p>
            ) : (
              <div className="detail-meta">
                <div className="detail-row">
                  <Icon name="calendar" />
                  <span className="detail-label">日付</span>
                  <span className="detail-value">
                    {parseDate(detailEvent.date).getFullYear()}年
                    {fullDate(parseDate(detailEvent.date))}
                  </span>
                </div>
                <div className="detail-row">
                  <Icon name="clock" />
                  <span className="detail-label">時間</span>
                  <span className="detail-value">{timeRange(detailEvent)}</span>
                </div>
                <div className="detail-row">
                  <Icon name="pin" />
                  <span className="detail-label">場所</span>
                  <span className="detail-value">
                    {detailEvent.location || "場所未定"}
                  </span>
                </div>
              </div>
            )}
            {deleteError && (
              <p className="form-error" role="alert">
                {deleteError}
              </p>
            )}
          </div>
          <div className="modal-actions">
            {dialog.type === "delete" ? (
              <>
                <button
                  className="secondary-button"
                  disabled={deleting}
                  onClick={() => {
                    setDialog({ type: "detail", id: detailEvent.id });
                    setDeleteError("");
                  }}
                >
                  キャンセル
                </button>
                <button
                  className="danger-button"
                  disabled={deleting}
                  onClick={deleteEvent}
                >
                  {deleting ? "削除中…" : "削除する"}
                </button>
              </>
            ) : (
              <>
                <button
                  className="text-button delete-button"
                  onClick={() => {
                    setDeleteError("");
                    setDialog({ type: "delete", id: detailEvent.id });
                  }}
                >
                  <Icon name="trash" size={16} />
                  削除
                </button>
                <button
                  className="primary-button"
                  onClick={() => {
                    setDeleteError("");
                    setDialog({ type: "form", initial: { ...detailEvent } });
                  }}
                >
                  <Icon name="edit" size={16} />
                  予定を編集
                </button>
              </>
            )}
          </div>
        </Modal>
      )}
      {dialog?.type === "help" && (
        <Modal titleId="help-title" onClose={() => setDialog(null)}>
          <div className="modal-header">
            <div>
              <span className="modal-eyebrow">毎日の予定を、心地よく。</span>
              <h2 className="modal-title" id="help-title">
                カレンダーの使い方
              </h2>
            </div>
            <button
              className="icon-button"
              aria-label="閉じる"
              onClick={() => setDialog(null)}
            >
              <Icon name="close" />
            </button>
          </div>
          <div className="modal-body help-body">
            <p>
              「予定を追加」から、予定名・日付・時間・種類・場所を登録できます。種類は「ライブ」「通院」「その他」から選べます。
            </p>
            <p>
              カレンダーの日付を選ぶと、その日の予定が表示されます。予定を押すと、詳細の確認・編集・削除ができます。
            </p>
            <p>
              左側の「予定の種類」を押すと、種類ごとに表示を切り替えられます。
            </p>
            <p>
              キーボードの <kbd>N</kbd> で予定を追加、<kbd>Esc</kbd>{" "}
              でダイアログを閉じられます。
            </p>
            <div className="help-note">
              <Icon name="leaf" />
              <p>
                ログイン中の会員の予定だけが表示されます。ログアウトすると、別のアカウントに切り替えられます。
              </p>
            </div>
          </div>
          <div className="modal-actions">
            <button className="primary-button" onClick={() => setDialog(null)}>
              はじめる
            </button>
          </div>
        </Modal>
      )}
      <div className="toast-container" role="status" aria-live="polite">
        {toast && (
          <div className="toast">
            <Icon name="check" size={17} />
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}
