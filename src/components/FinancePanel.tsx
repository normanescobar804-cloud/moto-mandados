import React, { useMemo, useState } from 'react';
import { BarChart3, Check, Download, Search, TrendingUp, Wallet, ShieldCheck } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Department,
  ServiceCategory,
  TariffSettings,
  Transaction,
} from '../types';
import {
  SERVICE_CATEGORY_LABELS,
  formatCurrency,
  formatShortDate,
  toMillis,
} from '../utils/tariffs';
import { useTheme } from '../utils/theme';

type FinancePeriod = 'daily' | 'weekly' | 'monthly' | 'all';
type DailyChartRange = 7 | 14 | 30;
type DailyChartMode = 'comparison' | 'net_only';
type FinanceScope = 'driver' | 'fleet';

interface DailyEarningsDatum {
  dateKey: string;
  label: string;
  fullDate: string;
  net: number;
  fee: number;
  gross: number;
  count: number;
}

interface DailyEarningsTooltipProps {
  active?: boolean;
  payload?: Array<{
    payload?: DailyEarningsDatum;
  }>;
  currency: string;
}

const toLocalDateKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const escapeCsvCell = (raw: string | number | boolean | null | undefined): string => {
  const str = String(raw ?? '');
  const safe = /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
  if (/[",\n\r]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
};

const DailyEarningsTooltip: React.FC<DailyEarningsTooltipProps> = ({
  active,
  payload,
  currency,
}) => {
  if (!active || !payload || payload.length === 0) return null;
  const datum = payload[0]?.payload;
  if (!datum) return null;

  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-md p-3 text-xs space-y-1.5 min-w-[210px]">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-1.5">
        <span className="font-semibold text-slate-900 capitalize">
          {datum.fullDate}
        </span>
        <span className="font-mono tabular-nums text-[11px] text-slate-500">
          {datum.count} {datum.count === 1 ? 'entrega' : 'entregas'}
        </span>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="flex items-center gap-1.5 text-slate-600">
          <span className="w-2.5 h-2.5 rounded-xs bg-emerald-600 inline-block" />
          Ingresos Netos
        </span>
        <span className="font-mono tabular-nums font-bold text-emerald-700">
          {formatCurrency(datum.net, currency)}
        </span>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="flex items-center gap-1.5 text-slate-600">
          <span className="w-2.5 h-2.5 rounded-xs bg-orange-600 inline-block" />
          Comisión Plataforma
        </span>
        <span className="font-mono tabular-nums font-semibold text-orange-700">
          {formatCurrency(datum.fee, currency)}
        </span>
      </div>
      <div className="flex items-center justify-between gap-4 pt-1 border-t border-slate-100">
        <span className="text-slate-500">Total Bruto</span>
        <span className="font-mono tabular-nums font-semibold text-slate-900">
          {formatCurrency(datum.gross, currency)}
        </span>
      </div>
    </div>
  );
};

interface FinancePanelProps {
  transactions: Transaction[];
  tariffs: TariffSettings;
  departments: Department[];
  currentRiderUid: string;
  isAdminView: boolean;
}

export const FinancePanel: React.FC<FinancePanelProps> = ({
  transactions,
  tariffs,
  departments,
  currentRiderUid,
  isAdminView,
}) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [period, setPeriod] = useState<FinancePeriod>('weekly');
  const [chartDays, setChartDays] = useState<DailyChartRange>(7);
  const [chartMode, setChartMode] = useState<DailyChartMode>('comparison');
  const [scope, setScope] = useState<FinanceScope>('driver');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | ServiceCategory>('all');
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
  const [exportFeedback, setExportFeedback] = useState<string | null>(null);

  const effectiveScope: FinanceScope = isAdminView ? scope : 'driver';

  const scopedTransactions = useMemo(() => {
    const base =
      effectiveScope === 'fleet'
        ? transactions
        : transactions.filter((t) => t.riderUid === currentRiderUid);

    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const cutoff =
      period === 'all'
        ? 0
        : period === 'daily'
        ? now - dayMs
        : period === 'weekly'
        ? now - 7 * dayMs
        : now - 30 * dayMs;

    return base
      .filter((t) => {
        if (period === 'all') return true;
        const ms = toMillis(t.createdAt);
        return ms === 0 || ms >= cutoff;
      })
      .filter((t) =>
        categoryFilter === 'all'
          ? true
          : (t.serviceCategory || 'delivery') === categoryFilter
      )
      .filter((t) =>
        departmentFilter === 'all'
          ? true
          : (t.departmentId || 'dept_centro') === departmentFilter
      )
      .filter((t) => {
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return (
          t.motoName.toLowerCase().includes(q) ||
          t.riderName.toLowerCase().includes(q) ||
          t.deliveryId.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
  }, [
    transactions,
    effectiveScope,
    currentRiderUid,
    period,
    searchQuery,
    categoryFilter,
    departmentFilter,
  ]);

  const totals = useMemo(() => {
    return scopedTransactions.reduce(
      (acc, t) => ({
        gross: acc.gross + t.grossAmount,
        net: acc.net + t.riderNetAmount,
        fee: acc.fee + t.platformFee,
        km: acc.km + t.distanceKm,
        urgentCount: acc.urgentCount + (t.isUrgent ? 1 : 0),
      }),
      { gross: 0, net: 0, fee: 0, km: 0, urgentCount: 0 }
    );
  }, [scopedTransactions]);

  const dailyEarningsData = useMemo(() => {
    const base =
      effectiveScope === 'fleet'
        ? transactions
        : transactions.filter((t) => t.riderUid === currentRiderUid);

    const filteredBase = base
      .filter((t) =>
        categoryFilter === 'all'
          ? true
          : (t.serviceCategory || 'delivery') === categoryFilter
      )
      .filter((t) =>
        departmentFilter === 'all'
          ? true
          : (t.departmentId || 'dept_centro') === departmentFilter
      )
      .filter((t) => {
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return (
          t.motoName.toLowerCase().includes(q) ||
          t.riderName.toLowerCase().includes(q) ||
          t.deliveryId.toLowerCase().includes(q)
        );
      });

    const today = new Date();
    const todayKey = toLocalDateKey(today);
    const bucketMap = new Map<string, DailyEarningsDatum>();
    const orderedKeys: string[] = [];

    for (let i = chartDays - 1; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
      const dateKey = toLocalDateKey(d);
      const label =
        chartDays <= 7
          ? new Intl.DateTimeFormat('es-MX', {
              weekday: 'short',
              day: '2-digit',
            }).format(d)
          : new Intl.DateTimeFormat('es-MX', {
              day: '2-digit',
              month: 'short',
            }).format(d);
      const fullDate = new Intl.DateTimeFormat('es-MX', {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
      }).format(d);

      orderedKeys.push(dateKey);
      bucketMap.set(dateKey, {
        dateKey,
        label,
        fullDate,
        net: 0,
        fee: 0,
        gross: 0,
        count: 0,
      });
    }

    filteredBase.forEach((t) => {
      const ms = toMillis(t.createdAt);
      const dateKey = ms === 0 ? todayKey : toLocalDateKey(new Date(ms));
      const bucket = bucketMap.get(dateKey);
      if (!bucket) return;
      bucket.net += t.riderNetAmount;
      bucket.fee += t.platformFee;
      bucket.gross += t.grossAmount;
      bucket.count += 1;
    });

    return orderedKeys.map((key) => {
      const b = bucketMap.get(key)!;
      return {
        ...b,
        net: Number(b.net.toFixed(2)),
        fee: Number(b.fee.toFixed(2)),
        gross: Number(b.gross.toFixed(2)),
      };
    });
  }, [
    transactions,
    effectiveScope,
    currentRiderUid,
    categoryFilter,
    departmentFilter,
    searchQuery,
    chartDays,
  ]);

  const dailyChartTotals = useMemo(() => {
    const summary = dailyEarningsData.reduce(
      (acc, d) => ({
        net: acc.net + d.net,
        fee: acc.fee + d.fee,
        count: acc.count + d.count,
      }),
      { net: 0, fee: 0, count: 0 }
    );
    const avgNet = chartDays > 0 ? summary.net / chartDays : 0;
    const bestDay = dailyEarningsData.reduce<DailyEarningsDatum | null>(
      (best, cur) => (!best || cur.net > best.net ? cur : best),
      null
    );
    return {
      ...summary,
      avgNet: Number(avgNet.toFixed(2)),
      bestDay: bestDay && bestDay.net > 0 ? bestDay : null,
    };
  }, [dailyEarningsData, chartDays]);

  const handleExportCsv = () => {
    if (scopedTransactions.length === 0) return;

    const deptNameById = new Map(departments.map((d) => [d.id, d.name]));
    const headers = [
      'ID_Transaccion',
      'ID_Entrega',
      'Fecha_ISO',
      'Fecha_Local',
      'Departamento',
      'Vertical',
      'Unidad',
      'Repartidor',
      'Prioridad',
      'Distancia_Km',
      'Tarifa_Base',
      'Tarifa_Km',
      'Recargo_Urgente',
      'Total_Bruto',
      'Comision_Plataforma',
      'Viaje_Gratis',
      'Neto_Motociclista',
      'Moneda',
      'Estado',
    ];

    const rows = scopedTransactions.map((t) => {
      const ms = toMillis(t.createdAt);
      const isoDate = ms ? new Date(ms).toISOString() : '';
      const deptLabel =
        deptNameById.get(t.departmentId) || t.departmentId || 'dept_centro';
      const statusLabel = t.status === 'settled' ? 'Liquidada' : 'Completada';
      return [
        t.id,
        t.deliveryId,
        isoDate,
        formatShortDate(t.createdAt),
        deptLabel,
        SERVICE_CATEGORY_LABELS[t.serviceCategory || 'delivery'],
        t.motoName,
        t.riderName,
        t.isUrgent ? 'Urgente' : 'Estándar',
        t.distanceKm.toFixed(2),
        t.baseFare.toFixed(2),
        t.distanceFare.toFixed(2),
        t.urgentSurcharge.toFixed(2),
        t.grossAmount.toFixed(2),
        t.platformFee.toFixed(2),
        t.usedFreeTrip ? 'Viaje Gratis (0%)' : `Estándar (${t.feeRatePct ?? tariffs.platformFeePct}%)`,
        t.riderNetAmount.toFixed(2),
        tariffs.currency,
        statusLabel,
      ].map(escapeCsvCell);
    });

    const csv = `\uFEFF${[
      headers.map(escapeCsvCell).join(','),
      ...rows.map((r) => r.join(',')),
    ].join('\r\n')}`;

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `moto-mando-transacciones-${effectiveScope}-${period}-${toLocalDateKey(
      new Date()
    )}.csv`;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    setExportFeedback(
      `CSV exportado (${scopedTransactions.length} ${
        scopedTransactions.length === 1 ? 'registro' : 'registros'
      })`
    );
    setTimeout(() => setExportFeedback(null), 3500);
  };

  return (
    <div className="space-y-6">
      {/* Header & Period Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-bold text-slate-900">
            Finanzas, Ganancias y Sistema de Tarifas
          </h2>
          <p className="text-xs text-slate-500">
            Seguimiento financiero transparente diario, semanal y mensual
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
          {isAdminView && (
            <div className="w-full sm:w-auto grid grid-cols-2 sm:flex items-center p-1 bg-slate-200/70 rounded-lg">
              <button
                type="button"
                onClick={() => setScope('driver')}
                className={`min-h-[38px] sm:min-h-0 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  scope === 'driver'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Mis Ganancias
              </button>
              <button
                type="button"
                onClick={() => setScope('fleet')}
                className={`min-h-[38px] sm:min-h-0 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  scope === 'fleet'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Toda la Flota
              </button>
            </div>
          )}

          <select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            className="w-full sm:w-auto min-h-[40px] sm:min-h-0 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700"
            aria-label="Filtrar por departamento"
          >
            <option value="all">Todos los Departamentos</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>

          <select
            value={categoryFilter}
            onChange={(e) =>
              setCategoryFilter(e.target.value as 'all' | ServiceCategory)
            }
            className="w-full sm:w-auto min-h-[40px] sm:min-h-0 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700"
            aria-label="Filtrar por vertical"
          >
            <option value="all">Todas las Verticales</option>
            <option value="pasajero">Pasajero Moto</option>
            <option value="delivery">Delivery</option>
            <option value="comercio">Comercio</option>
            <option value="super_expres">Súper Exprés</option>
          </select>

          <div className="w-full sm:w-auto grid grid-cols-4 sm:flex items-center p-1 bg-slate-200/70 rounded-lg">
            {(
              [
                { id: 'daily', label: 'Diario' },
                { id: 'weekly', label: 'Semanal' },
                { id: 'monthly', label: 'Mensual' },
                { id: 'all', label: 'Todo' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setPeriod(tab.id)}
                className={`min-h-[38px] sm:min-h-0 px-2 sm:px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  period === tab.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleExportCsv}
            disabled={scopedTransactions.length === 0}
            className="w-full sm:w-auto min-h-[40px] sm:min-h-0 inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50 text-xs font-semibold text-slate-700 cursor-pointer whitespace-nowrap"
          >
            <Download className="w-4 h-4" />
            <span>
              Exportar CSV
              {scopedTransactions.length > 0 ? ` (${scopedTransactions.length})` : ''}
            </span>
          </button>
        </div>
      </div>

      {/* KPI Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Ganancia Neta Repartidor</span>
            <Wallet className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="font-mono tabular-nums text-2xl font-bold text-emerald-700">
            {formatCurrency(totals.net, tariffs.currency)}
          </div>
          <div className="text-xs text-slate-500">
            {100 - tariffs.platformFeePct}% del monto bruto
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Facturación Bruta</span>
            <TrendingUp className="w-4 h-4 text-slate-400" />
          </div>
          <div className="font-mono tabular-nums text-2xl font-bold text-slate-900">
            {formatCurrency(totals.gross, tariffs.currency)}
          </div>
          <div className="text-xs text-slate-500">
            {scopedTransactions.length} entregas liquidadas
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Comisión Plataforma</span>
            <ShieldCheck className="w-4 h-4 text-slate-400" />
          </div>
          <div className="font-mono tabular-nums text-2xl font-bold text-slate-900">
            {formatCurrency(totals.fee, tariffs.currency)}
          </div>
          <div className="text-xs text-slate-500">
            Tasa transparente del {tariffs.platformFeePct}%
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-1.5">
          <div className="text-xs text-slate-500">Distancia y Urgencias</div>
          <div className="font-mono tabular-nums text-2xl font-bold text-slate-900">
            {totals.km.toFixed(1)} km
          </div>
          <div className="text-xs text-slate-500">
            {totals.urgentCount} servicios urgentes en periodo
          </div>
        </div>
      </div>

      {/* Chart + Transparent Tariff Rules */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-8 min-w-0 bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-emerald-600 shrink-0" />
                <h3 className="font-display text-base font-bold text-slate-900">
                  {effectiveScope === 'fleet'
                    ? `Ganancias Diarias de Flota · Últimos ${chartDays} días`
                    : `Ganancias Diarias del Conductor · Últimos ${chartDays} días`}
                </h3>
              </div>
              <p className="text-xs text-slate-500">
                {chartMode === 'net_only'
                  ? `Evolución diaria de ingresos netos durante los últimos ${chartDays} días`
                  : 'Comparativa diaria entre ingresos netos del conductor y comisiones de plataforma'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 self-start">
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                <button
                  type="button"
                  onClick={() => setChartMode('comparison')}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    chartMode === 'comparison'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Neto vs. Comisión
                </button>
                <button
                  type="button"
                  onClick={() => setChartMode('net_only')}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    chartMode === 'net_only'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Solo Ganancias
                </button>
              </div>

              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                {([7, 14, 30] as const).map((days) => (
                  <button
                    key={days}
                    type="button"
                    onClick={() => setChartDays(days)}
                    className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                      chartDays === days
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {days}d
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-3 border-y border-slate-200 text-xs">
            <div>
              <span className="text-slate-500 block">Neto acumulado ({chartDays}d)</span>
              <span className="font-mono tabular-nums font-bold text-emerald-700 text-sm">
                {formatCurrency(dailyChartTotals.net, tariffs.currency)}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block">Promedio diario</span>
              <span className="font-mono tabular-nums font-semibold text-slate-900 text-sm">
                {formatCurrency(dailyChartTotals.avgNet, tariffs.currency)}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block">Comisiones ({chartDays}d)</span>
              <span className="font-mono tabular-nums font-bold text-orange-700 text-sm">
                {formatCurrency(dailyChartTotals.fee, tariffs.currency)}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block">Mejor día / Entregas</span>
              <span className="font-mono tabular-nums font-semibold text-slate-900 text-sm">
                {dailyChartTotals.bestDay
                  ? `${dailyChartTotals.bestDay.label} · ${formatCurrency(
                      dailyChartTotals.bestDay.net,
                      tariffs.currency
                    )}`
                  : `${dailyChartTotals.count} entregas`}
              </span>
            </div>
          </div>

          <div className="h-72 w-full min-w-0">
            <ResponsiveContainer width="100%" height={288} minWidth={0}>
              <BarChart
                data={dailyEarningsData}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                barGap={4}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke={isDark ? '#24324B' : '#E2E8F0'}
                />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: isDark ? '#94A3B8' : '#64748B' }}
                  axisLine={{ stroke: isDark ? '#24324B' : '#E2E8F0' }}
                  tickLine={false}
                  minTickGap={10}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: isDark ? '#94A3B8' : '#64748B' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(value: number) => `$${value}`}
                  width={56}
                />
                <Tooltip
                  content={<DailyEarningsTooltip currency={tariffs.currency} />}
                  cursor={{
                    fill: isDark ? 'rgba(30, 41, 59, 0.55)' : '#F8FAFC',
                  }}
                />
                <Legend
                  wrapperStyle={{
                    fontSize: '12px',
                    paddingTop: '8px',
                    color: isDark ? '#CBD5E1' : '#334155',
                  }}
                  iconType="square"
                  iconSize={10}
                />
                {dailyChartTotals.avgNet > 0 && (
                  <ReferenceLine
                    y={dailyChartTotals.avgNet}
                    stroke={isDark ? '#CBD5E1' : '#0F172A'}
                    strokeDasharray="4 4"
                    strokeOpacity={0.45}
                  />
                )}
                <Bar
                  dataKey="net"
                  name="Ganancias Netas Conductor"
                  fill="#059669"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={chartMode === 'net_only' ? 38 : 26}
                />
                {chartMode === 'comparison' && (
                  <Bar
                    dataKey="fee"
                    name="Comisiones de Plataforma"
                    fill="#EA580C"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={26}
                  />
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>

          {dailyChartTotals.count === 0 && (
            <p className="text-[11px] text-slate-500 text-center">
              Sin entregas liquidadas en los últimos {chartDays} días para los filtros actuales. Completa una ruta en Modo Conductor para ver tus barras diarias.
            </p>
          )}
        </div>

        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div>
            <h3 className="font-display text-base font-bold text-slate-900">
              Sistema Básico de Tarifas
            </h3>
            <p className="text-xs text-slate-500">
              Cálculo transparente aplicado a cada entrega
            </p>
          </div>

          <div className="divide-y divide-slate-200 text-xs">
            <div className="py-2.5 flex justify-between">
              <span className="text-slate-600">Banderazo / Tarifa base</span>
              <span className="font-mono tabular-nums font-semibold text-slate-900">
                {formatCurrency(tariffs.baseFare, tariffs.currency)}
              </span>
            </div>
            <div className="py-2.5 flex justify-between">
              <span className="text-slate-600">Costo por kilómetro recorrido</span>
              <span className="font-mono tabular-nums font-semibold text-slate-900">
                {formatCurrency(tariffs.perKmRate, tariffs.currency)} / km
              </span>
            </div>
            <div className="py-2.5 flex justify-between">
              <span className="text-slate-600">Multiplicador prioridad urgente</span>
              <span className="font-mono tabular-nums font-semibold text-orange-700">
                ×{tariffs.urgentMultiplier.toFixed(2)}
              </span>
            </div>
            <div className="py-2.5 flex justify-between">
              <span className="text-slate-600">Recargo fijo express</span>
              <span className="font-mono tabular-nums font-semibold text-orange-700">
                +{formatCurrency(tariffs.expressFixedSurcharge, tariffs.currency)}
              </span>
            </div>
            <div className="py-2.5 flex justify-between">
              <span className="text-slate-600">Deducción por viaje</span>
              <span className="font-mono tabular-nums font-semibold text-orange-700">
                {tariffs.platformFeePct}% (0% en Viajes Gratis)
              </span>
            </div>
            <div className="py-2.5 flex justify-between">
              <span className="text-slate-600">Participación motociclista</span>
              <span className="font-mono tabular-nums font-semibold text-emerald-700">
                {100 - tariffs.platformFeePct}% neto (100% con bono)
              </span>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-[11px] text-slate-600 leading-relaxed">
            Fórmula: <span className="font-mono text-slate-900">(Base + km × tarifa) + recargo urgente</span>. Se deduce el {tariffs.platformFeePct}% por viaje desde tu saldo (Banpro Nicaragua / Banco LAFISE), salvo cuando tengas Viajes Gratis desbloqueados (0% comisión).
          </div>
        </div>
      </div>

      {/* Ledger Table & Mobile Card List */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 sm:px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-base font-bold text-slate-900">
              Historial Detallado de Transacciones ({scopedTransactions.length})
            </h3>
            <p className="text-xs text-slate-500">
              Registro inmutable de tarifas, comisiones y ganancias netas
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
            {exportFeedback && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 whitespace-nowrap">
                <Check className="w-3.5 h-3.5" />
                {exportFeedback}
              </span>
            )}
            <div className="relative flex-1 sm:flex-initial sm:w-60 min-w-[160px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar unidad o ID..."
                className="w-full min-h-[40px] sm:min-h-0 pl-9 pr-3 py-2 sm:py-1.5 rounded-lg border border-slate-300 text-base sm:text-xs focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={scopedTransactions.length === 0}
              className="w-full sm:w-auto min-h-[40px] sm:min-h-0 inline-flex items-center justify-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Descargar CSV</span>
            </button>
          </div>
        </div>

        {scopedTransactions.length === 0 ? (
          <div className="p-8 sm:p-10 text-center text-xs text-slate-500">
            Aún no hay transacciones registradas en este periodo. Completa una entrega desde el Panel del Motociclista para ver el desglose financiero.
          </div>
        ) : (
          <>
            {/* Mobile Card Ledger */}
            <div className="md:hidden divide-y divide-slate-200">
              {scopedTransactions.map((tx) => (
                <div key={tx.id} className="p-4 space-y-2 text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900 truncate">
                        {tx.motoName} · {tx.riderName}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {formatShortDate(tx.createdAt)} ·{' '}
                        {SERVICE_CATEGORY_LABELS[tx.serviceCategory || 'delivery']} ·{' '}
                        {departments.find((d) => d.id === tx.departmentId)?.code || 'CTR'}
                      </div>
                    </div>
                    <div className="text-right font-mono tabular-nums shrink-0">
                      <div className="font-bold text-emerald-700 text-sm">
                        +{formatCurrency(tx.riderNetAmount, tariffs.currency)}
                      </div>
                      <div className="text-[11px] text-slate-500">Neto Moto</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 text-[11px] font-mono tabular-nums">
                    <div>
                      <div className="text-slate-500 font-sans">Distancia</div>
                      <div className="font-semibold text-slate-800">
                        {tx.distanceKm.toFixed(2)} km
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500 font-sans">Bruto</div>
                      <div className="font-semibold text-slate-800">
                        {formatCurrency(tx.grossAmount, tariffs.currency)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-slate-500 font-sans">Comisión</div>
                      {tx.usedFreeTrip ? (
                        <div className="font-semibold text-emerald-700">
                          0% · Viaje Gratis
                        </div>
                      ) : (
                        <div className="font-semibold text-slate-600">
                          -{formatCurrency(tx.platformFee, tariffs.currency)}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500">
                    <th className="py-2.5 px-4">Fecha / Entrega</th>
                    <th className="py-2.5 px-3">Unidad</th>
                    <th className="py-2.5 px-3 text-right">Distancia</th>
                    <th className="py-2.5 px-3 text-right">Base + Km</th>
                    <th className="py-2.5 px-3 text-right">Urgente</th>
                    <th className="py-2.5 px-3 text-right">Bruto</th>
                    <th className="py-2.5 px-3 text-right">Comisión</th>
                    <th className="py-2.5 px-4 text-right">Neto Moto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-xs">
                  {scopedTransactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900">
                          {formatShortDate(tx.createdAt)}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {SERVICE_CATEGORY_LABELS[tx.serviceCategory || 'delivery']} ·{' '}
                          {departments.find((d) => d.id === tx.departmentId)?.code || 'CTR'}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-semibold text-slate-900">
                          {tx.motoName}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {tx.riderName}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-700">
                        {tx.distanceKm.toFixed(2)} km
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-700">
                        {formatCurrency(tx.baseFare + tx.distanceFare, tariffs.currency)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-orange-700">
                        {tx.urgentSurcharge > 0
                          ? `+${formatCurrency(tx.urgentSurcharge, tariffs.currency)}`
                          : '—'}
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-900 font-medium">
                        {formatCurrency(tx.grossAmount, tariffs.currency)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums">
                        {tx.usedFreeTrip ? (
                          <span className="font-semibold text-emerald-700">
                            0% · Viaje Gratis
                          </span>
                        ) : (
                          <span className="text-slate-500">
                            -{formatCurrency(tx.platformFee, tariffs.currency)}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-bold text-emerald-700">
                        +{formatCurrency(tx.riderNetAmount, tariffs.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
