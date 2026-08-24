export function money(value: number) {
  const currency = localStorage.getItem("ledger_currency") ?? "INR";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
}

export function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

export function monthLabel(month: string) {
  return new Date(`${month}-01T00:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

export function monthRangeLabel(month: string) {
  const year = Number(month.slice(0, 4));
  const monthIndex = Number(month.slice(5, 7)) - 1;
  const days = new Date(year, monthIndex + 1, 0).getDate();
  const short = new Date(year, monthIndex, 1).toLocaleDateString("en-IN", { month: "short" });
  return `${short} 1 – ${short} ${days}, ${year}`;
}

export function recentMonths(count = 12) {
  const now = new Date();
  return Array.from({ length: count }, (_, offset) => {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    return { value, label: monthLabel(value) };
  });
}

const CATEGORY_TONES: Record<string, string> = {
  food: "warm",
  shopping: "warm",
  subscriptions: "purple",
  entertainment: "purple",
  salary: "green",
  freelance: "green",
  health: "green",
  transport: "blue",
  education: "blue",
  bills: "amber",
  housing: "amber",
  utilities: "amber",
  other: "neutral"
};

export function categoryTone(category: string) {
  return CATEGORY_TONES[category.trim().toLowerCase()] ?? "neutral";
}

export function dayLabel(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function fullDateLabel(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}
