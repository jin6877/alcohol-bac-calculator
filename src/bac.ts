// BAC 계산 로직 (Widmark 공식 기반)

export type Gender = "male" | "female";

export interface Drink {
  id: string;
  preset: string; // 음료 종류 키
  volumeMl: number; // 마신 용량 (ml)
  abv: number; // 알코올 도수 (%)
  drankAt: number; // 마신 시각 (ms timestamp)
}

export interface DrinkPreset {
  key: string;
  label: string;
  emoji: string;
  defaultAbv: number;
  defaultVolumeMl: number;
  unitLabel: string; // "잔", "캔", "샷" 등
}

export const DRINK_PRESETS: DrinkPreset[] = [
  { key: "soju", label: "소주", emoji: "🍶", defaultAbv: 17, defaultVolumeMl: 50, unitLabel: "잔" },
  { key: "beer", label: "맥주", emoji: "🍺", defaultAbv: 4.5, defaultVolumeMl: 250, unitLabel: "잔" },
  { key: "beer-can", label: "맥주 캔", emoji: "🥫", defaultAbv: 4.5, defaultVolumeMl: 500, unitLabel: "캔" },
  { key: "wine", label: "와인", emoji: "🍷", defaultAbv: 12, defaultVolumeMl: 150, unitLabel: "잔" },
  { key: "makgeolli", label: "막걸리", emoji: "🍚", defaultAbv: 6, defaultVolumeMl: 200, unitLabel: "잔" },
  { key: "whisky", label: "위스키", emoji: "🥃", defaultAbv: 40, defaultVolumeMl: 30, unitLabel: "샷" },
  { key: "highball", label: "하이볼", emoji: "🧊", defaultAbv: 8, defaultVolumeMl: 300, unitLabel: "잔" },
  { key: "sake", label: "사케", emoji: "🍶", defaultAbv: 15, defaultVolumeMl: 90, unitLabel: "잔" },
  { key: "cocktail", label: "칵테일", emoji: "🍸", defaultAbv: 15, defaultVolumeMl: 150, unitLabel: "잔" },
  { key: "custom", label: "직접 입력", emoji: "✏️", defaultAbv: 5, defaultVolumeMl: 100, unitLabel: "잔" },
];

export function getPreset(key: string): DrinkPreset {
  return DRINK_PRESETS.find((p) => p.key === key) ?? DRINK_PRESETS[0];
}

// 알코올 밀도 (g/ml)
export const ETHANOL_DENSITY = 0.789;

// 시간당 분해 속도 (BAC% per hour)
export const BETA = 0.015;

// 한국 도로교통법 기준
export const LIMIT_SUSPEND = 0.03; // 면허정지
export const LIMIT_REVOKE = 0.08; // 면허취소

// 한 잔의 순수 알코올 g
export function alcoholGrams(volumeMl: number, abv: number): number {
  return volumeMl * (abv / 100) * ETHANOL_DENSITY;
}

// Widmark r factor
export function widmarkR(gender: Gender): number {
  return gender === "male" ? 0.68 : 0.55;
}

// 특정 시각 t (ms)에서의 BAC (%)
// 각 잔마다: BAC 기여 = (alc_g / (weight_kg * r * 1000)) * 100
// 단, 마신 시각 이전에는 0, 이후엔 마신 즉시 풀로 더해진 뒤 β로 감소
export function bacAt(t: number, drinks: Drink[], weightKg: number, gender: Gender): number {
  if (weightKg <= 0 || drinks.length === 0) return 0;
  const r = widmarkR(gender);
  let total = 0;
  for (const d of drinks) {
    if (t < d.drankAt) continue;
    const hours = (t - d.drankAt) / 3_600_000;
    const peak = (alcoholGrams(d.volumeMl, d.abv) / (weightKg * r * 1000)) * 100;
    const cur = peak - BETA * hours;
    if (cur > 0) total += cur;
  }
  return total;
}

// BAC가 threshold 미만으로 떨어지는 가장 빠른 시각 찾기 (이분 탐색)
export function timeWhenBacBelow(
  threshold: number,
  drinks: Drink[],
  weightKg: number,
  gender: Gender,
  fromTime: number
): number | null {
  if (drinks.length === 0) return fromTime;
  const cur = bacAt(fromTime, drinks, weightKg, gender);
  if (cur < threshold) return fromTime;

  // 최대 48시간까지 탐색
  const maxT = fromTime + 48 * 3_600_000;
  if (bacAt(maxT, drinks, weightKg, gender) >= threshold) return null;

  let lo = fromTime;
  let hi = maxT;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (bacAt(mid, drinks, weightKg, gender) >= threshold) lo = mid;
    else hi = mid;
  }
  return hi;
}

export type RiskLevel = "safe" | "suspend" | "revoke";

export function riskLevel(bac: number): RiskLevel {
  if (bac >= LIMIT_REVOKE) return "revoke";
  if (bac >= LIMIT_SUSPEND) return "suspend";
  return "safe";
}

export function riskLabel(level: RiskLevel): string {
  if (level === "revoke") return "면허취소 수준";
  if (level === "suspend") return "면허정지 수준";
  return "처벌 기준 미만";
}

// BAC 시계열 데이터 (그래프용)
export interface BacPoint {
  t: number;
  bac: number;
  label: string;
}

export function bacSeries(
  drinks: Drink[],
  weightKg: number,
  gender: Gender,
  now: number,
  hoursForward = 12
): BacPoint[] {
  if (drinks.length === 0) return [];
  const start = Math.min(now, ...drinks.map((d) => d.drankAt));
  const end = now + hoursForward * 3_600_000;
  const points: BacPoint[] = [];
  const stepMs = 5 * 60_000; // 5분 간격
  for (let t = start; t <= end; t += stepMs) {
    points.push({
      t,
      bac: +bacAt(t, drinks, weightKg, gender).toFixed(4),
      label: formatHM(new Date(t)),
    });
  }
  return points;
}

export function formatHM(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function formatKoreanDateTime(d: Date, now = new Date()): string {
  const isSameDay = d.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = d.toDateString() === tomorrow.toDateString();
  const dayAfter = new Date(now);
  dayAfter.setDate(dayAfter.getDate() + 2);
  const isDayAfter = d.toDateString() === dayAfter.toDateString();

  const h = d.getHours();
  const m = d.getMinutes();
  const ampm = h < 12 ? "오전" : "오후";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const timeStr = `${ampm} ${h12}:${String(m).padStart(2, "0")}`;

  if (isSameDay) return `오늘 ${timeStr}`;
  if (isTomorrow) return `내일 ${timeStr}`;
  if (isDayAfter) return `모레 ${timeStr}`;
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${timeStr}`;
}

export function formatDuration(ms: number): string {
  if (ms <= 0) return "지금";
  const totalMin = Math.round(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}분 후`;
  if (m === 0) return `${h}시간 후`;
  return `${h}시간 ${m}분 후`;
}

export function formatTimeAgo(ms: number): string {
  if (ms < 0) return formatDuration(-ms).replace("후", "전 (예정)");
  const totalMin = Math.round(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}분 전`;
  if (m === 0) return `${h}시간 전`;
  return `${h}시간 ${m}분 전`;
}

// 로컬 datetime input 값 ↔ Date
export function toLocalDatetimeInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalDatetimeInput(s: string): number {
  return new Date(s).getTime();
}
