export const CATEGORIES = {
  live: { label: "ライブ", className: "category-live", icon: "music" },
  medical: { label: "通院", className: "category-medical", icon: "medical" },
  other: { label: "その他", className: "category-other", icon: "coffee" },
};
export const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

export function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function parseDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

export function addDays(date, amount) {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() + amount,
    12,
  );
}

export function monthGrid(month) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1, 12);
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0, 12);
  const count = Math.ceil((first.getDay() + last.getDate()) / 7) * 7;
  const start = addDays(first, -first.getDay());
  return Array.from({ length: count }, (_, index) => addDays(start, index));
}

export function moveMonth(month, offset) {
  return new Date(month.getFullYear(), month.getMonth() + offset, 1, 12);
}

export function sortEvents(events) {
  return [...events].sort((a, b) =>
    `${a.date} ${a.start}`.localeCompare(`${b.date} ${b.start}`),
  );
}

export function validateEvent(event) {
  const errors = {};
  if (!event.title.trim()) errors.title = "予定名を入力してください。";
  else if (event.title.trim().length > 80)
    errors.title = "予定名は80文字以内で入力してください。";
  const parsed =
    /^\d{4}-\d{2}-\d{2}$/.test(event.date) && parseDate(event.date);
  if (
    !parsed ||
    !Number.isFinite(parsed.getTime()) ||
    dateKey(parsed) !== event.date ||
    parsed.getFullYear() < 1900 ||
    parsed.getFullYear() > 9999
  ) {
    errors.date = "1900年から9999年までの有効な日付を選んでください。";
  }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(event.start))
    errors.start = "開始時間を入力してください。";
  if (
    event.end &&
    (!/^([01]\d|2[0-3]):[0-5]\d$/.test(event.end) || event.end <= event.start)
  ) {
    errors.end = "終了時間は開始時間より後にしてください。";
  }
  if (!CATEGORIES[event.category])
    errors.category = "予定の種類を選んでください。";
  if (event.location.trim().length > 120)
    errors.location = "場所は120文字以内で入力してください。";
  return errors;
}
