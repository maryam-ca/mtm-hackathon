// Dark-mode categorical steps (validated with the dataviz validator on surface #0e1527).
export const S = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#0ca30c", "#9085e9"];
export const CTX = "#55607a";       // de-emphasis (context) gray
export const TRACK = "#1d2438";
export const GOOD = "#0ca30c", WARN = "#fab219", CRIT = "#d03b3b";
export const RAMP = ["#184f95", "#1c5cab", "#256abf", "#2a78d6", "#3987e5", "#5598e7"]; // sequential blue, dark→bright
export const ramp = (i, n) => RAMP[Math.round((n <= 1 ? 0 : i / (n - 1)) * (RAMP.length - 1))];
export const inkOn = (c) => (c === WARN ? "#0b0b0b" : "#fff");
export const pct = (v, t) => (t ? (v / t) * 100 : 0);
export const KIND_COLOR = { hack: S[0], lunch: S[1], prayer: S[2], judging: S[3], open: CTX, close: CTX };
export const KIND_LABEL = { hack: "Hacking", lunch: "Lunch", prayer: "Prayer break", judging: "Judging", open: "Opening / closing", close: "Opening / closing" };
