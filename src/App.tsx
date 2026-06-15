import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  DRINK_PRESETS,
  LIMIT_REVOKE,
  LIMIT_SUSPEND,
  bacAt,
  bacSeries,
  formatDuration,
  formatKoreanDateTime,
  formatTimeAgo,
  fromLocalDatetimeInput,
  getPreset,
  riskLabel,
  riskLevel,
  timeWhenBacBelow,
  toLocalDatetimeInput,
  type Drink,
  type Gender,
} from "./bac";

const STORAGE_KEY = "alcohol-bac-calculator/v1";

interface SavedState {
  gender: Gender;
  weight: number;
  drinks: Drink[];
}

function loadState(): SavedState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveState(s: SavedState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* noop */
  }
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export default function App() {
  const initial = loadState();
  const [gender, setGender] = useState<Gender>(initial?.gender ?? "male");
  const [weight, setWeight] = useState<number>(initial?.weight ?? 70);
  const [drinks, setDrinks] = useState<Drink[]>(initial?.drinks ?? []);
  const [now, setNow] = useState<number>(Date.now());
  const [manualNow, setManualNow] = useState(false);

  // 자동 현재시각 업데이트 (1분마다)
  useEffect(() => {
    if (manualNow) return;
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, [manualNow]);

  // 영속화
  useEffect(() => {
    saveState({ gender, weight, drinks });
  }, [gender, weight, drinks]);

  const currentBac = useMemo(
    () => bacAt(now, drinks, weight, gender),
    [now, drinks, weight, gender]
  );

  const level = riskLevel(currentBac);

  const safeTime = useMemo(
    () => timeWhenBacBelow(LIMIT_SUSPEND, drinks, weight, gender, now),
    [drinks, weight, gender, now]
  );
  const sobererTime = useMemo(
    () => timeWhenBacBelow(0.001, drinks, weight, gender, now),
    [drinks, weight, gender, now]
  );

  const series = useMemo(() => {
    const hoursForward = Math.max(
      12,
      safeTime ? Math.ceil((safeTime - now) / 3_600_000) + 2 : 12
    );
    return bacSeries(drinks, weight, gender, now, hoursForward);
  }, [drinks, weight, gender, now, safeTime]);

  function addDrink(presetKey: string) {
    const p = getPreset(presetKey);
    const newDrink: Drink = {
      id: uid(),
      preset: p.key,
      volumeMl: p.defaultVolumeMl,
      abv: p.defaultAbv,
      drankAt: Date.now(),
    };
    setDrinks((ds) => [...ds, newDrink]);
  }

  function updateDrink(id: string, patch: Partial<Drink>) {
    setDrinks((ds) => ds.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }

  function removeDrink(id: string) {
    setDrinks((ds) => ds.filter((d) => d.id !== id));
  }

  function resetAll() {
    if (confirm("모든 음주 기록과 입력값을 초기화할까요?")) {
      setDrinks([]);
      setGender("male");
      setWeight(70);
    }
  }

  const levelColor =
    level === "revoke"
      ? "bg-red-600 text-red-50 ring-red-400/50"
      : level === "suspend"
      ? "bg-amber-500 text-amber-950 ring-amber-300/60"
      : "bg-emerald-600 text-emerald-50 ring-emerald-400/40";

  const bacColor =
    level === "revoke"
      ? "text-red-400"
      : level === "suspend"
      ? "text-amber-300"
      : "text-emerald-300";

  const bgGradient =
    level === "revoke"
      ? "from-red-950/60 via-[#2A0B16] to-[#1a0610]"
      : level === "suspend"
      ? "from-amber-950/40 via-[#2A0B16] to-[#1a0610]"
      : "from-emerald-950/30 via-[#2A0B16] to-[#1a0610]";

  return (
    <div className={`min-h-screen bg-gradient-to-b ${bgGradient} transition-colors duration-700`}>
      <div className="mx-auto max-w-3xl px-4 py-6 sm:py-10">
        <Header />

        {/* 결과 카드 */}
        <ResultCard
          bac={currentBac}
          level={level}
          levelColor={levelColor}
          bacColor={bacColor}
          safeTime={safeTime}
          sobererTime={sobererTime}
          now={now}
          hasDrinks={drinks.length > 0}
        />

        {/* 그래프 */}
        {drinks.length > 0 && series.length > 0 && (
          <ChartCard
            series={series}
            now={now}
            safeTime={safeTime}
          />
        )}

        {/* 개인 정보 */}
        <Section title="개인 정보">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-amber-200/70 mb-1.5 font-medium">성별</label>
              <div className="grid grid-cols-2 gap-1.5 rounded-lg bg-black/30 p-1">
                {(["male", "female"] as const).map((g) => (
                  <button
                    key={g}
                    onClick={() => setGender(g)}
                    className={`py-2 rounded-md text-sm font-medium transition ${
                      gender === g
                        ? "bg-amber-500 text-amber-950 shadow"
                        : "text-amber-100/70 hover:text-amber-100"
                    }`}
                  >
                    {g === "male" ? "남성" : "여성"}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs text-amber-200/70 mb-1.5 font-medium">체중 (kg)</label>
              <input
                type="number"
                inputMode="decimal"
                value={weight}
                min={30}
                max={200}
                onChange={(e) => setWeight(Number(e.target.value) || 0)}
                className="w-full bg-black/30 border border-amber-900/40 rounded-lg px-3 py-2 text-amber-50 focus:outline-none focus:border-amber-500/70 focus:ring-2 focus:ring-amber-500/20"
              />
            </div>
          </div>
        </Section>

        {/* 음주 기록 */}
        <Section
          title={`음주 기록 ${drinks.length > 0 ? `(${drinks.length}잔)` : ""}`}
          right={
            drinks.length > 0 && (
              <button
                onClick={resetAll}
                className="text-xs text-amber-200/60 hover:text-amber-300 underline underline-offset-2"
              >
                전체 초기화
              </button>
            )
          }
        >
          {/* 프리셋 버튼 */}
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mb-3">
            {DRINK_PRESETS.map((p) => (
              <button
                key={p.key}
                onClick={() => addDrink(p.key)}
                className="group flex flex-col items-center gap-1 py-2.5 px-1 rounded-lg bg-black/30 border border-amber-900/30 hover:border-amber-500/60 hover:bg-amber-950/40 active:scale-95 transition"
              >
                <span className="text-2xl group-hover:scale-110 transition">{p.emoji}</span>
                <span className="text-[11px] text-amber-100/80 font-medium leading-tight text-center">
                  {p.label}
                </span>
              </button>
            ))}
          </div>

          {/* 드링크 리스트 */}
          {drinks.length === 0 ? (
            <div className="text-center py-8 text-amber-200/40 text-sm">
              위에서 마신 술을 선택하세요
            </div>
          ) : (
            <div className="space-y-2">
              {[...drinks]
                .sort((a, b) => a.drankAt - b.drankAt)
                .map((d) => (
                  <DrinkRow
                    key={d.id}
                    drink={d}
                    now={now}
                    onChange={(patch) => updateDrink(d.id, patch)}
                    onRemove={() => removeDrink(d.id)}
                  />
                ))}
            </div>
          )}
        </Section>

        {/* 현재 시각 설정 */}
        <Section title="기준 시각">
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="datetime-local"
              value={toLocalDatetimeInput(new Date(now))}
              onChange={(e) => {
                setNow(fromLocalDatetimeInput(e.target.value));
                setManualNow(true);
              }}
              className="bg-black/30 border border-amber-900/40 rounded-lg px-3 py-2 text-amber-50 text-sm focus:outline-none focus:border-amber-500/70"
            />
            <button
              onClick={() => {
                setNow(Date.now());
                setManualNow(false);
              }}
              className="px-3 py-2 text-sm bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 rounded-lg border border-amber-500/40"
            >
              지금
            </button>
            {manualNow && (
              <span className="text-xs text-amber-300/70">수동 시각 설정 중</span>
            )}
          </div>
        </Section>

        {/* 면책 */}
        <Disclaimer />

        <footer className="text-center text-xs text-amber-200/30 mt-8 pb-4">
          Made with Widmark formula · 절대 음주운전 금지
        </footer>
      </div>
    </div>
  );
}

function Header() {
  return (
    <header className="mb-6 sm:mb-8">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-400 to-amber-700 flex items-center justify-center text-2xl shadow-lg shadow-amber-900/40">
          🥃
        </div>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-amber-50 tracking-tight leading-tight">
            알코올 분해 <span className="shimmer-text">계산기</span>
          </h1>
          <p className="text-xs sm:text-sm text-amber-200/60">
            운전 가능 시각을 예측해 드립니다
          </p>
        </div>
      </div>
    </header>
  );
}

function Section({
  title,
  right,
  children,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-5 rounded-2xl bg-[#3D0F1F]/70 border border-amber-900/30 backdrop-blur p-4 sm:p-5 shadow-xl shadow-black/30">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold text-amber-100/90 uppercase tracking-wider">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

function ResultCard({
  bac,
  level,
  levelColor,
  bacColor,
  safeTime,
  sobererTime,
  now,
  hasDrinks,
}: {
  bac: number;
  level: "safe" | "suspend" | "revoke";
  levelColor: string;
  bacColor: string;
  safeTime: number | null;
  sobererTime: number | null;
  now: number;
  hasDrinks: boolean;
}) {
  return (
    <section className="mb-5 rounded-3xl bg-gradient-to-br from-[#4A1625] to-[#2A0B16] border border-amber-700/30 p-6 shadow-2xl shadow-black/50">
      <div className="text-center">
        <div className="text-[11px] uppercase tracking-[0.2em] text-amber-200/50 mb-2">
          현재 추정 BAC
        </div>
        <div className={`text-6xl sm:text-7xl font-black tracking-tight ${bacColor} tabular-nums`}>
          {bac.toFixed(3)}
          <span className="text-2xl sm:text-3xl ml-1 text-amber-200/60">%</span>
        </div>
        <div className="mt-4 flex justify-center">
          <span className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-bold ring-2 ${levelColor}`}>
            <span className="w-2 h-2 rounded-full bg-current opacity-80" />
            {riskLabel(level)}
          </span>
        </div>
      </div>

      {hasDrinks && (
        <div className="mt-6 pt-5 border-t border-amber-900/30 grid sm:grid-cols-2 gap-4">
          <DriveTimeBlock
            label="운전 가능 시각 (0.03% 미만)"
            t={safeTime}
            now={now}
            accent="amber"
          />
          <DriveTimeBlock
            label="거의 해독 (0.001% 미만)"
            t={sobererTime}
            now={now}
            accent="emerald"
          />
        </div>
      )}

      {!hasDrinks && (
        <p className="mt-5 text-center text-xs text-amber-200/40">
          아래에서 마신 술을 입력하면 운전 가능 시각이 계산됩니다
        </p>
      )}
    </section>
  );
}

function DriveTimeBlock({
  label,
  t,
  now,
  accent,
}: {
  label: string;
  t: number | null;
  now: number;
  accent: "amber" | "emerald";
}) {
  const color = accent === "amber" ? "text-amber-200" : "text-emerald-200";
  if (t === null) {
    return (
      <div className="rounded-xl bg-black/30 p-3">
        <div className="text-[10px] uppercase tracking-wider text-amber-200/50 mb-1">{label}</div>
        <div className={`text-base font-bold ${color}`}>48시간 이상 필요</div>
      </div>
    );
  }
  return (
    <div className="rounded-xl bg-black/30 p-3">
      <div className="text-[10px] uppercase tracking-wider text-amber-200/50 mb-1">{label}</div>
      <div className={`text-base sm:text-lg font-bold ${color} leading-tight`}>
        {formatKoreanDateTime(new Date(t), new Date(now))}
      </div>
      <div className="text-xs text-amber-100/50 mt-0.5">
        {t <= now ? "지금부터 가능" : `지금부터 ${formatDuration(t - now)}`}
      </div>
    </div>
  );
}

function ChartCard({
  series,
  now,
  safeTime,
}: {
  series: { t: number; bac: number; label: string }[];
  now: number;
  safeTime: number | null;
}) {
  const maxBac = Math.max(0.1, ...series.map((p) => p.bac));
  return (
    <section className="mb-5 rounded-2xl bg-[#3D0F1F]/70 border border-amber-900/30 backdrop-blur p-4 sm:p-5">
      <h2 className="text-sm font-bold text-amber-100/90 uppercase tracking-wider mb-3">
        시간별 BAC 추이
      </h2>
      <div className="h-56 -mx-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={series} margin={{ top: 10, right: 12, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id="bacFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#F59E0B" stopOpacity={0.6} />
                <stop offset="100%" stopColor="#F59E0B" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#7c2d12" strokeOpacity={0.2} vertical={false} />
            <XAxis
              dataKey="t"
              type="number"
              domain={["dataMin", "dataMax"]}
              tickFormatter={(t) => {
                const d = new Date(t);
                return `${d.getHours()}시`;
              }}
              stroke="#fbbf2470"
              tick={{ fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              domain={[0, Math.max(maxBac * 1.15, LIMIT_REVOKE * 1.2)]}
              tickFormatter={(v) => v.toFixed(2)}
              stroke="#fbbf2470"
              tick={{ fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={45}
            />
            <Tooltip
              contentStyle={{
                background: "#2A0B16",
                border: "1px solid #92400e",
                borderRadius: 8,
                fontSize: 12,
              }}
              labelStyle={{ color: "#fcd34d" }}
              itemStyle={{ color: "#fef3c7" }}
              formatter={(v) => [`${Number(v).toFixed(3)}%`, "BAC"]}
              labelFormatter={(t) => {
                const d = new Date(Number(t));
                return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
              }}
            />
            <ReferenceLine
              y={LIMIT_REVOKE}
              stroke="#ef4444"
              strokeDasharray="4 4"
              label={{ value: "면허취소 0.08", position: "insideTopRight", fill: "#fca5a5", fontSize: 10 }}
            />
            <ReferenceLine
              y={LIMIT_SUSPEND}
              stroke="#fbbf24"
              strokeDasharray="4 4"
              label={{ value: "면허정지 0.03", position: "insideTopRight", fill: "#fde68a", fontSize: 10 }}
            />
            <ReferenceLine x={now} stroke="#fef3c7" strokeOpacity={0.6} label={{ value: "지금", position: "top", fill: "#fef3c7", fontSize: 10 }} />
            {safeTime !== null && safeTime > now && (
              <ReferenceLine
                x={safeTime}
                stroke="#34d399"
                strokeDasharray="2 2"
              />
            )}
            <Area
              type="monotone"
              dataKey="bac"
              stroke="#F59E0B"
              strokeWidth={2.5}
              fill="url(#bacFill)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function DrinkRow({
  drink,
  now,
  onChange,
  onRemove,
}: {
  drink: Drink;
  now: number;
  onChange: (patch: Partial<Drink>) => void;
  onRemove: () => void;
}) {
  const preset = getPreset(drink.preset);
  const ago = now - drink.drankAt;
  return (
    <div className="rounded-xl bg-black/30 border border-amber-900/30 p-3">
      <div className="flex items-center gap-2 mb-2.5">
        <span className="text-xl">{preset.emoji}</span>
        <span className="font-bold text-amber-100 text-sm">{preset.label}</span>
        <span className="text-xs text-amber-200/50 ml-auto">{formatTimeAgo(ago)}</span>
        <button
          onClick={onRemove}
          aria-label="삭제"
          className="w-7 h-7 flex items-center justify-center rounded-md text-amber-200/50 hover:bg-red-900/40 hover:text-red-300 transition"
        >
          ✕
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Field label="용량(ml)">
          <input
            type="number"
            value={drink.volumeMl}
            min={1}
            onChange={(e) => onChange({ volumeMl: Number(e.target.value) || 0 })}
            className="w-full bg-black/40 border border-amber-900/30 rounded-md px-2 py-1.5 text-sm text-amber-50 focus:outline-none focus:border-amber-500/60"
          />
        </Field>
        <Field label="도수(%)">
          <input
            type="number"
            step="0.1"
            value={drink.abv}
            min={0}
            max={100}
            onChange={(e) => onChange({ abv: Number(e.target.value) || 0 })}
            className="w-full bg-black/40 border border-amber-900/30 rounded-md px-2 py-1.5 text-sm text-amber-50 focus:outline-none focus:border-amber-500/60"
          />
        </Field>
        <Field label="마신 시각">
          <input
            type="datetime-local"
            value={toLocalDatetimeInput(new Date(drink.drankAt))}
            onChange={(e) => onChange({ drankAt: fromLocalDatetimeInput(e.target.value) })}
            className="w-full bg-black/40 border border-amber-900/30 rounded-md px-2 py-1.5 text-xs text-amber-50 focus:outline-none focus:border-amber-500/60"
          />
        </Field>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[10px] text-amber-200/50 mb-1 uppercase tracking-wider">
        {label}
      </span>
      {children}
    </label>
  );
}

function Disclaimer() {
  return (
    <section className="mb-5 rounded-2xl border border-red-700/40 bg-red-950/30 p-4 text-sm leading-relaxed text-red-100/90">
      <div className="flex items-start gap-2.5">
        <span className="text-xl flex-shrink-0">⚠️</span>
        <div>
          <div className="font-bold text-red-200 mb-1">법적 면책 안내</div>
          <p className="text-red-100/80 text-[13px]">
            본 계산은 <b>Widmark 공식</b> 기반 통계적 추정치이며 실제 BAC와 다를 수 있습니다.
            개인의 대사 속도, 위장 상태, 약물 복용 여부 등에 따라 결과가 크게 달라질 수 있어요.
          </p>
          <p className="text-red-100 text-[13px] mt-1.5 font-semibold">
            음주 후에는 절대 운전하지 마세요. 가장 안전한 기준은 “술 마신 다음 날에도 운전 금지”입니다.
          </p>
        </div>
      </div>
    </section>
  );
}
