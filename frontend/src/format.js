export const rs = (n) => `Rs ${Number(n).toLocaleString("en-US")}`;

export function clock(plan, minutes) {
  const st = plan?.inputs?.start_time;
  if (st && /^\d{1,2}:\d{2}$/.test(st)) {
    const [h, m] = st.split(":").map(Number);
    const t = h * 60 + m + minutes;
    return `${String(Math.floor(t / 60) % 24).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
  }
  return `T+${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
}

export const AREAS = ["venue", "schedule", "food", "judging", "budget"];
