import { CTX, S } from "./tokens.js";

const AREA_COLOR = { venue: S[0], food: S[1], judging: S[2], budget: S[3] };
const AREA_NAME = { venue: "Venue", food: "Food", judging: "Judge honorarium", budget: "Already ordered" };

/** Budget split into parts for the segmented bar (+ remaining as the neutral track). */
export function budgetParts(plan) {
  const b = plan.budget, sums = {};
  b.lines.forEach((l) => { sums[l.area] = (sums[l.area] || 0) + l.amount; });
  const parts = ["venue", "food", "judging", "budget"].filter((a) => sums[a]).map((a) => ({ name: AREA_NAME[a], value: sums[a], color: AREA_COLOR[a] }));
  if (b.remaining > 0) parts.push({ name: "Remaining", value: b.remaining, color: "#2a3250", ink: "#c3c2b7" });
  return parts;
}

/** Waterfall columns: every ledger line, coloured by area. */
export function waterfallSteps(plan) {
  return plan.budget.lines.map((l) => ({
    label: l.area === "budget" ? l.item.replace("Already ordered - ", "") : AREA_NAME[l.area],
    value: l.amount, color: AREA_COLOR[l.area],
  }));
}

export const countBy = (arr, fn) => {
  const m = {};
  arr.forEach((x) => { const k = fn(x); m[k] = (m[k] || 0) + 1; });
  return Object.entries(m).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
};

export const STATUS_PARTS = {
  active: { name: "Active", color: "#0ca30c" },
  superseded: { name: "Superseded", color: "#fab219", ink: "#0b0b0b" },
  rejected: { name: "Rejected", color: "#d03b3b" },
  accepted: { name: "Accepted", color: "#0ca30c" },
  irrelevant: { name: "Ignored", color: CTX },
};
