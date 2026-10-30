import test from "node:test";
import assert from "node:assert/strict";
import {
  monthGrid,
  dateKey,
  moveMonth,
  validateEvent,
  sortEvents,
} from "./calendar.js";

test("うるう年の2月は29日を含み日曜日から土曜日まで並ぶ", () => {
  const grid = monthGrid(new Date(2024, 1, 1));
  assert.equal(grid[0].getDay(), 0);
  assert.equal(grid.at(-1).getDay(), 6);
  assert.equal(grid.length % 7, 0);
  assert.ok(grid.some((day) => dateKey(day) === "2024-02-29"));
  assert.equal(new Set(grid.map(dateKey)).size, grid.length);
});

test("月末からの月移動と年越しを正しく処理する", () => {
  assert.equal(dateKey(moveMonth(new Date(2026, 11, 31), 1)), "2027-01-01");
  assert.equal(dateKey(moveMonth(new Date(2026, 0, 31), -1)), "2025-12-01");
  assert.equal(dateKey(moveMonth(new Date(2026, 0, 31), 1)), "2026-02-01");
});

const event = {
  title: "ライブ",
  date: "2026-10-30",
  start: "19:00",
  end: "21:00",
  category: "live",
  location: "東京",
};

test("有効な予定と終了時間なしの予定を受け付ける", () => {
  assert.deepEqual(validateEvent(event), {});
  assert.deepEqual(validateEvent({ ...event, end: "", location: "" }), {});
});

test("存在しない日付や逆転した時刻、空白の予定名を拒否する", () => {
  assert.ok(validateEvent({ ...event, date: "2026-02-29" }).date);
  assert.ok(validateEvent({ ...event, date: "2026-13-01" }).date);
  assert.ok(validateEvent({ ...event, end: "18:00" }).end);
  assert.ok(validateEvent({ ...event, end: "19:00" }).end);
  assert.ok(validateEvent({ ...event, start: "24:00" }).start);
  assert.ok(validateEvent({ ...event, title: "   " }).title);
  assert.ok(validateEvent({ ...event, category: "unknown" }).category);
});

test("予定は日付と開始時間の順に並び元の配列を変更しない", () => {
  const input = [
    { ...event, start: "20:00" },
    { ...event, date: "2026-10-29" },
    { ...event, start: "10:00" },
  ];
  const sorted = sortEvents(input);
  assert.equal(sorted[0].date, "2026-10-29");
  assert.equal(sorted[1].start, "10:00");
  assert.equal(input[0].start, "20:00");
});
