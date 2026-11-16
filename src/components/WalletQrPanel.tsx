import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  QrCode,
  Wallet as WalletIcon,
  ArrowUpRight,
  Download,
  Copy,
  Check,
  Clock,
  CheckCircle2,
  XCircle,
  Landmark,
  Plus,
  Trash2,
  Ticket,
  Percent,
} from 'lucide-react';
import {
  BankAccount,
  BankAccountType,
  QrTopup,
  RiderProfile,
  TariffSettings,
  Wallet,
} from '../types';
import { formatCurrency, formatShortDate, toMillis } from '../utils/tariffs';

export interface CreateBankTopupInput {
  amount: number;
  bankName: string;
  accountHolder: string;
  accountLast4: string;
  transferReference: string;
  destinationBank: string;
}

export interface AddBankAccountInput {
  alias: string;
  bankName: string;
  accountHolder: string;
  accountType: BankAccountType;
  accountNumber: string;
}

interface WalletQrPanelProps {
  wallet: Wallet;
  topups: QrTopup[];
  bankAccounts: BankAccount[];
  currentRider: RiderProfile;
  tariffs: TariffSettings;
  isAdminUser: boolean;
  onCreateTopup: (amount: number) => Promise<QrTopup | null>;
  onCreateBankTopup: (input: CreateBankTopupInput) => Promise<QrTopup | null>;
  onAddBankAccount: (input: AddBankAccountInput) => Promise<BankAccount | null>;
  onDeleteBankAccount: (accountId: string) => Promise<void>;
  onApproveTopup: (topup: QrTopup) => Promise<void>;
  onRejectTopup: (topup: QrTopup) => Promise<void>;
}

const PRESET_AMOUNTS = [100, 250, 500, 1000];

const BANK_OPTIONS = ['Banpro Nicaragua', 'Banco LAFISE'];

const RECEIVING_ACCOUNTS = [
  {
    id: 'banpro_mm',
    bank: 'Banpro Nicaragua',
    shortTag: 'Banpro Nicaragua',
    accountLabel: 'Cuenta Corporativa Banpro',
    clabe: '1002-0485-9271-04',
    beneficiary: 'Moto Mandados Nicaragua S.A.',
  },
  {
    id: 'lafise_mm',
    bank: 'Banco LAFISE (LAFISE Bancentro)',
    shortTag: 'Banco LAFISE',
    accountLabel: 'Cuenta Empresarial LAFISE',
    clabe: '1300-8492-1105-78',
    beneficiary: 'Moto Mandados Nicaragua S.A.',
  },
];

const TOPUP_STATUS_LABELS: Record<QrTopup['status'], string> = {
  pending: 'Pendiente de validación',
  approved: 'Acreditada',
  rejected: 'Rechazada',
};

const ACCOUNT_TYPE_LABELS: Record<BankAccountType, string> = {
  ahorro: 'Cuenta de Ahorro',
  corriente: 'Cuenta Corriente',
  debito: 'Tarjeta de Débito',
  cheques: 'Cheques',
  clabe: 'Cuenta / IBAN',
};

export const WalletQrPanel: React.FC<WalletQrPanelProps> = ({
  wallet,
  topups,
  bankAccounts,
  currentRider,
  tariffs,
  isAdminUser,
  onCreateTopup,
  onCreateBankTopup,
  onAddBankAccount,
  onDeleteBankAccount,
  onApproveTopup,
  onRejectTopup,
}) => {
  const [rechargeMode, setRechargeMode] = useState<'qr' | 'bank'>('bank');
  const [amountInput, setAmountInput] = useState('250');
  const [creating, setCreating] = useState(false);
  const [selectedTopupId, setSelectedTopupId] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Bank transfer recharge form state
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [selectedDestBankId, setSelectedDestBankId] = useState<string>(
    RECEIVING_ACCOUNTS[0].id
  );
  const [transferRef, setTransferRef] = useState('');
  const [showAddAccount, setShowAddAccount] = useState(false);

  // Quick manual bank inputs if user hasn't linked an account yet
  const [manualBankName, setManualBankName] = useState('Banpro Nicaragua');
  const [manualHolder, setManualHolder] = useState(currentRider.displayName);
  const [manualAccountDigits, setManualAccountDigits] = useState('');

  // Link new bank account form state
  const [newAlias, setNewAlias] = useState('');
  const [newBankName, setNewBankName] = useState('Banpro Nicaragua');
  const [newHolder, setNewHolder] = useState(currentRider.displayName);
  const [newAccountType, setNewAccountType] = useState<BankAccountType>('ahorro');
  const [newAccountNumber, setNewAccountNumber] = useState('');
  const [savingAccount, setSavingAccount] = useState(false);

  useEffect(() => {
    if (bankAccounts.length > 0) {
      if (!bankAccounts.some((a) => a.id === selectedAccountId)) {
        const def = bankAccounts.find((a) => a.isDefault) || bankAccounts[0];
        setSelectedAccountId(def.id);
      }
    } else {
      setSelectedAccountId('');
    }
  }, [bankAccounts, selectedAccountId]);

  const sortedTopups = [...topups].sort(
    (a, b) => toMillis(b.createdAt) - toMillis(a.createdAt)
  );

  const activeTopup =
    sortedTopups.find((t) => t.id === selectedTopupId) ||
    sortedTopups.find((t) => t.status === 'pending') ||
    sortedTopups[0] ||
    null;

  useEffect(() => {
    if (!activeTopup) {
      setQrDataUrl('');
      return;
    }
    let cancelled = false;
    QRCode.toDataURL(activeTopup.qrPayload, {
      width: 240,
      margin: 2,
      color: {
        dark: '#0F172A',
        light: '#FFFFFF',
      },
    })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl('');
      });

    return () => {
      cancelled = true;
    };
  }, [activeTopup]);

  const handleCopyText = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      // Clipboard blocked
    }
  };

  const handleGenerateQr = async (e: React.FormEvent) => {
    e.preventDefault();
    const numeric = Number(amountInput);
    if (!Number.isFinite(numeric) || numeric < 10 || numeric > 50000) {
      setErrorMsg('Ingresa un monto válido entre $10 y $50,000.');
      return;
    }
    setErrorMsg(null);
    setCreating(true);
    try {
      const created = await onCreateTopup(Number(numeric.toFixed(2)));
      if (created) {
        setSelectedTopupId(created.id);
      }
    } finally {
      setCreating(false);
    }
  };

  const handleLinkBankAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    const digitsOnly = newAccountNumber.replace(/\D/g, '');
    if (digitsOnly.length < 4) {
      setErrorMsg('Ingresa al menos los últimos 4 dígitos o el número de tu cuenta Banpro / LAFISE.');
      return;
    }
    if (!newHolder.trim()) {
      setErrorMsg('Ingresa el nombre del titular de la cuenta bancaria.');
      return;
    }
    setErrorMsg(null);
    setSavingAccount(true);
    try {
      const created = await onAddBankAccount({
        alias:
          newAlias.trim() || `${newBankName} •••• ${digitsOnly.slice(-4)}`,
        bankName: newBankName,
        accountHolder: newHolder.trim(),
        accountType: newAccountType,
        accountNumber: digitsOnly,
      });
      if (created) {
        setSelectedAccountId(created.id);
        setShowAddAccount(false);
        setNewAlias('');
        setNewAccountNumber('');
      }
    } finally {
      setSavingAccount(false);
    }
  };

  const handleCreateBankRecharge = async (e: React.FormEvent) => {
    e.preventDefault();
    const numeric = Number(amountInput);
    if (!Number.isFinite(numeric) || numeric < 10 || numeric > 50000) {
      setErrorMsg('Ingresa un monto válido entre $10 y $50,000.');
      return;
    }

    const linked = bankAccounts.find((a) => a.id === selectedAccountId);
    let bankName = linked?.bankName || manualBankName;
    let accountHolder = linked?.accountHolder || manualHolder.trim();
    let last4 = linked?.last4 || manualAccountDigits.replace(/\D/g, '').slice(-4);

    if (!linked) {
      if (!accountHolder || last4.length !== 4) {
        setErrorMsg(
          'Selecciona una cuenta bancaria vinculada o ingresa el titular y los últimos 4 dígitos de tu cuenta origen.'
        );
        return;
      }
    }

    const dest =
      RECEIVING_ACCOUNTS.find((d) => d.id === selectedDestBankId) ||
      RECEIVING_ACCOUNTS[0];

    setErrorMsg(null);
    setCreating(true);
    try {
      const created = await onCreateBankTopup({
        amount: Number(numeric.toFixed(2)),
        bankName,
        accountHolder,
        accountLast4: last4,
        transferReference:
          transferRef.trim() || `NIC-${Date.now().toString().slice(-8)}`,
        destinationBank: `${dest.bank} (${dest.clabe})`,
      });
      if (created) {
        setSelectedTopupId(created.id);
        setTransferRef('');
      }
    } finally {
      setCreating(false);
    }
  };

  const handleDownloadQr = () => {
    if (!qrDataUrl || !activeTopup) return;
    const link = document.createElement('a');
    link.href = qrDataUrl;
    link.download = `moto-mando-${activeTopup.referenceCode}.png`;
    link.click();
  };

  const selectedDest =
    RECEIVING_ACCOUNTS.find((d) => d.id === selectedDestBankId) ||
    RECEIVING_ACCOUNTS[0];

  return (
    <div className="space-y-6">
      {/* Wallet KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Saldo Operativo Disponible</span>
            <WalletIcon className="w-4 h-4 text-orange-600" />
          </div>
          <div className="font-mono tabular-nums text-2xl font-bold text-slate-900">
            {formatCurrency(wallet.balance, tariffs.currency)}
          </div>
          <div className="text-xs text-slate-500">
            Recargas Banpro Nicaragua y LAFISE
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Deducción por Viaje ({tariffs.platformFeePct}%)</span>
            <Percent className="w-4 h-4 text-orange-600" />
          </div>
          <div className="font-mono tabular-nums text-2xl font-bold text-slate-900">
            {formatCurrency(wallet.totalFeesDeducted || 0, tariffs.currency)}
          </div>
          <div className="text-xs text-slate-500">
            Se deduce {tariffs.platformFeePct}% por viaje realizado
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Viajes Gratis (0% Comisión)</span>
            <Ticket className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="font-mono tabular-nums text-2xl font-bold text-emerald-700">
            {wallet.freeTripsBalance || 0} viajes
          </div>
          <div className="text-xs text-slate-500">
            {wallet.freeTripsUsed || 0} usados · {wallet.freeTripsEarned || 0} desbloqueados
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Ganancias Netas en Ruta</span>
            <ArrowUpRight className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="font-mono tabular-nums text-2xl font-bold text-emerald-700">
            {formatCurrency(wallet.totalEarned, tariffs.currency)}
          </div>
          <div className="text-xs text-slate-500">
            Recargas aprobadas: {formatCurrency(wallet.totalTopups, tariffs.currency)}
          </div>
        </div>
      </div>

      {/* Recharge Form (Banpro Nicaragua & LAFISE or QR) + Active Receipt */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-4 sm:p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-slate-900 text-white flex items-center justify-center shrink-0">
                {rechargeMode === 'bank' ? (
                  <Landmark className="w-5 h-5 text-orange-400" />
                ) : (
                  <QrCode className="w-5 h-5 text-orange-400" />
                )}
              </div>
              <div>
                <h3 className="font-display text-base font-bold text-slate-900">
                  Recargar Saldo (Banpro Nicaragua · LAFISE)
                </h3>
                <p className="text-xs text-slate-500">
                  {rechargeMode === 'bank'
                    ? 'Transferencia oficial desde Banpro Nicaragua o Banco LAFISE'
                    : 'Ficha QR única para validación en caja o administración'}
                </p>
              </div>
            </div>

            <div className="flex items-center p-1 bg-slate-100 rounded-lg self-start sm:self-auto">
              <button
                type="button"
                onClick={() => {
                  setRechargeMode('bank');
                  setErrorMsg(null);
                }}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  rechargeMode === 'bank'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Landmark className="w-3.5 h-3.5" />
                <span>Cuenta Bancaria</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setRechargeMode('qr');
                  setErrorMsg(null);
                }}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  rechargeMode === 'qr'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <QrCode className="w-3.5 h-3.5" />
                <span>Código QR</span>
              </button>
            </div>
          </div>

          {/* Shared Amount Picker */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-2">
                Montos Rápidos ({tariffs.currency})
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {PRESET_AMOUNTS.map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setAmountInput(String(amt))}
                    className={`py-2.5 sm:py-2 px-3 rounded-lg border text-xs font-mono tabular-nums font-semibold transition-colors cursor-pointer ${
                      Number(amountInput) === amt
                        ? 'bg-orange-600 text-white border-orange-600'
                        : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    ${amt}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Monto a Recargar ({tariffs.currency})
              </label>
              <input
                type="number"
                min="10"
                max="50000"
                step="10"
                required
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm font-mono tabular-nums text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
          </div>

          {rechargeMode === 'bank' ? (
            <div className="space-y-4">
              {/* Linked Bank Accounts Selector or Inline Linker */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs font-semibold text-slate-700">
                    Tu Cuenta Bancaria de Origen
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddAccount((v) => !v);
                      setErrorMsg(null);
                    }}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-orange-600 hover:text-orange-700 cursor-pointer whitespace-nowrap"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{showAddAccount ? 'Cancelar' : 'Vincular Cuenta'}</span>
                  </button>
                </div>

                {showAddAccount && (
                  <form
                    onSubmit={handleLinkBankAccount}
                    className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-3"
                  >
                    <div className="text-xs font-semibold text-slate-900">
                      Registrar Cuenta Bancaria en tu Perfil
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <select
                        value={newBankName}
                        onChange={(e) => setNewBankName(e.target.value)}
                        className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs text-slate-900"
                        aria-label="Banco"
                      >
                        {BANK_OPTIONS.map((b) => (
                          <option key={b} value={b}>
                            {b}
                          </option>
                        ))}
                      </select>
                      <select
                        value={newAccountType}
                        onChange={(e) =>
                          setNewAccountType(e.target.value as BankAccountType)
                        }
                        className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs text-slate-900"
                        aria-label="Tipo de cuenta"
                      >
                        <option value="ahorro">Cuenta de Ahorro</option>
                        <option value="corriente">Cuenta Corriente</option>
                        <option value="debito">Tarjeta de Débito</option>
                      </select>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <input
                        type="text"
                        required
                        placeholder="Titular de la cuenta"
                        value={newHolder}
                        onChange={(e) => setNewHolder(e.target.value)}
                        className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs text-slate-900"
                      />
                      <input
                        type="text"
                        required
                        placeholder="Número de cuenta o últimos 4 dígitos"
                        value={newAccountNumber}
                        onChange={(e) => setNewAccountNumber(e.target.value)}
                        className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs font-mono text-slate-900"
                      />
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        placeholder="Alias opcional (ej. Banpro Ahorro)"
                        value={newAlias}
                        onChange={(e) => setNewAlias(e.target.value)}
                        className="flex-1 px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs text-slate-900"
                      />
                      <button
                        type="submit"
                        disabled={savingAccount}
                        className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
                      >
                        {savingAccount ? 'Guardando...' : 'Guardar Cuenta'}
                      </button>
                    </div>
                  </form>
                )}

                {bankAccounts.length > 0 ? (
                  <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg overflow-hidden">
                    {bankAccounts.map((acc) => {
                      const active = acc.id === selectedAccountId;
                      return (
                        <div
                          key={acc.id}
                          className={`px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs transition-colors ${
                            active ? 'bg-orange-50/70' : 'bg-white hover:bg-slate-50'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => setSelectedAccountId(acc.id)}
                            className="flex-1 text-left cursor-pointer min-w-0"
                          >
                            <div className="font-semibold text-slate-900 truncate">
                              {acc.alias} · {acc.bankName}
                            </div>
                            <div className="text-[11px] text-slate-500 font-mono truncate">
                              {ACCOUNT_TYPE_LABELS[acc.accountType]} {acc.clabeMasked} ·{' '}
                              {acc.accountHolder}
                            </div>
                          </button>
                          <div className="flex items-center gap-2 shrink-0">
                            {active && (
                              <span className="text-[11px] font-semibold text-orange-700">
                                Seleccionada
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => void onDeleteBankAccount(acc.id)}
                              className="p-1 text-slate-400 hover:text-red-600 cursor-pointer"
                              aria-label={`Eliminar cuenta ${acc.alias}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <select
                      value={manualBankName}
                      onChange={(e) => setManualBankName(e.target.value)}
                      className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs text-slate-900"
                      aria-label="Banco origen"
                    >
                      {BANK_OPTIONS.map((b) => (
                        <option key={b} value={b}>
                          {b}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      placeholder="Nombre del titular"
                      value={manualHolder}
                      onChange={(e) => setManualHolder(e.target.value)}
                      className="px-3 py-2 rounded-lg border border-slate-300 text-xs text-slate-900"
                    />
                    <input
                      type="text"
                      maxLength={18}
                      placeholder="Últimos 4 dígitos"
                      value={manualAccountDigits}
                      onChange={(e) => setManualAccountDigits(e.target.value)}
                      className="px-3 py-2 rounded-lg border border-slate-300 text-xs font-mono text-slate-900"
                    />
                  </div>
                )}
              </div>

              {/* Moto Mandados Destination Bank Account (Banpro Nicaragua & LAFISE) */}
              <form onSubmit={handleCreateBankRecharge} className="space-y-3.5">
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-slate-700">
                    Banco Oficial Destino (Banpro Nicaragua o Banco LAFISE)
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {RECEIVING_ACCOUNTS.map((dest) => {
                      const active = dest.id === selectedDestBankId;
                      return (
                        <button
                          key={dest.id}
                          type="button"
                          onClick={() => setSelectedDestBankId(dest.id)}
                          className={`p-3 rounded-lg border text-left transition-colors cursor-pointer ${
                            active
                              ? 'border-orange-500 bg-orange-50'
                              : 'border-slate-200 bg-white hover:bg-slate-50'
                          }`}
                        >
                          <div className="text-xs font-bold text-slate-900">
                            {dest.shortTag}
                          </div>
                          <div className="font-mono text-[11px] text-slate-600 mt-0.5">
                            {dest.clabe}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
                    <div className="min-w-0 space-y-0.5">
                      <div className="font-semibold text-slate-900">
                        {selectedDest.bank} · {selectedDest.beneficiary}
                      </div>
                      <div className="font-mono tabular-nums text-slate-700 truncate">
                        {selectedDest.accountLabel}: {selectedDest.clabe}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        void handleCopyText('dest_clabe', selectedDest.clabe)
                      }
                      className="w-full sm:w-auto min-h-[38px] sm:min-h-0 inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 font-semibold cursor-pointer whitespace-nowrap shrink-0"
                    >
                      {copiedKey === 'dest_clabe' ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      <span>
                        {copiedKey === 'dest_clabe' ? 'Copiada' : 'Copiar Cuenta'}
                      </span>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Número de Comprobante / Referencia Banpro o LAFISE (opcional)
                  </label>
                  <input
                    type="text"
                    maxLength={60}
                    placeholder="Ej. NIC-94827104 (si se omite se genera folio automático)"
                    value={transferRef}
                    onChange={(e) => setTransferRef(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-lg border border-slate-300 text-xs font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>

                {errorMsg && (
                  <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                    {errorMsg}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={creating}
                  className="w-full py-2.5 px-4 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-xs font-semibold transition-colors cursor-pointer inline-flex items-center justify-center gap-2 whitespace-nowrap"
                >
                  <Landmark className="w-4 h-4 text-orange-400" />
                  <span>
                    {creating
                      ? 'Registrando transferencia...'
                      : 'Registrar Recarga por Cuenta Bancaria'}
                  </span>
                </button>
              </form>
            </div>
          ) : (
            <form onSubmit={handleGenerateQr} className="space-y-4">
              {errorMsg && (
                <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                  {errorMsg}
                </div>
              )}

              <button
                type="submit"
                disabled={creating}
                className="w-full py-2.5 px-4 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-xs font-semibold transition-colors cursor-pointer inline-flex items-center justify-center gap-2 whitespace-nowrap"
              >
                <QrCode className="w-4 h-4 text-orange-400" />
                <span>
                  {creating
                    ? 'Generando código QR...'
                    : 'Generar Código QR de Recarga'}
                </span>
              </button>

              <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 text-[11px] text-slate-600 leading-relaxed">
                Cada código QR incluye la referencia de unidad{' '}
                <span className="font-mono font-semibold text-slate-800">
                  {currentRider.motoPlate}
                </span>{' '}
                y folio único de auditoría. Una vez validado por administración, el saldo se suma de inmediato a tu billetera.
              </div>
            </form>
          )}
        </div>

        {/* Active Top-Up Receipt / QR Display */}
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-4 sm:p-6 flex flex-col justify-between">
          {!activeTopup ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-10 space-y-2">
              <Landmark className="w-10 h-10 text-slate-300" />
              <div className="text-sm font-semibold text-slate-700">
                Ninguna recarga registrada todavía
              </div>
              <p className="text-xs text-slate-500 max-w-xs">
                Realiza una recarga desde tu cuenta bancaria o genera un código QR a la izquierda.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-200">
                <div>
                  <div className="text-xs text-slate-500">
                    {activeTopup.method === 'bank_transfer'
                      ? 'Comprobante de Transferencia Bancaria'
                      : 'Folio de Recarga QR'}
                  </div>
                  <div className="font-mono text-sm font-bold text-slate-900">
                    {activeTopup.referenceCode}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono tabular-nums text-lg font-bold text-slate-900">
                    {formatCurrency(activeTopup.amount, tariffs.currency)}
                  </div>
                  <div
                    className={`text-xs font-semibold ${
                      activeTopup.status === 'approved'
                        ? 'text-emerald-700'
                        : activeTopup.status === 'rejected'
                        ? 'text-red-700'
                        : 'text-orange-700'
                    }`}
                  >
                    {TOPUP_STATUS_LABELS[activeTopup.status]}
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-5">
                <div className="p-3 rounded-xl border border-slate-200 bg-white keep-light shrink-0">
                  {qrDataUrl ? (
                    <img
                      src={qrDataUrl}
                      alt={`Comprobante ${activeTopup.referenceCode}`}
                      className="w-40 h-40 block"
                    />
                  ) : (
                    <div className="w-40 h-40 bg-slate-100 flex items-center justify-center text-xs text-slate-400">
                      Generando...
                    </div>
                  )}
                </div>

                <div className="flex-1 space-y-2.5 text-xs w-full">
                  <div>
                    <div className="text-slate-500">Titular y Unidad</div>
                    <div className="font-semibold text-slate-900">
                      {activeTopup.motoName} · {activeTopup.riderName}
                    </div>
                  </div>

                  {activeTopup.method === 'bank_transfer' && (
                    <>
                      <div>
                        <div className="text-slate-500">Cuenta Origen</div>
                        <div className="font-semibold text-slate-900">
                          {activeTopup.bankName} ·{' '}
                          <span className="font-mono">
                            •••• {activeTopup.accountLast4}
                          </span>{' '}
                          · {activeTopup.accountHolder}
                        </div>
                      </div>
                      {activeTopup.destinationBank && (
                        <div>
                          <div className="text-slate-500">Cuenta Destino</div>
                          <div className="text-slate-800 font-mono text-[11px]">
                            {activeTopup.destinationBank}
                          </div>
                        </div>
                      )}
                      {activeTopup.transferReference && (
                        <div>
                          <div className="text-slate-500">Clave de Rastreo</div>
                          <div className="font-mono font-semibold text-slate-900">
                            {activeTopup.transferReference}
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  <div>
                    <div className="text-slate-500">Fecha de registro</div>
                    <div className="text-slate-800">
                      {formatShortDate(activeTopup.createdAt)}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() =>
                        void handleCopyText(
                          'active_folio',
                          activeTopup.referenceCode
                        )
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold cursor-pointer whitespace-nowrap"
                    >
                      {copiedKey === 'active_folio' ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      <span>
                        {copiedKey === 'active_folio' ? 'Copiado' : 'Copiar Folio'}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadQr}
                      disabled={!qrDataUrl}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold cursor-pointer whitespace-nowrap"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Descargar PNG</span>
                    </button>
                  </div>

                  {isAdminUser && activeTopup.status === 'pending' && (
                    <div className="pt-2 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={actionId === activeTopup.id}
                        onClick={async () => {
                          setActionId(activeTopup.id);
                          try {
                            await onApproveTopup(activeTopup);
                          } finally {
                            setActionId(null);
                          }
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold cursor-pointer whitespace-nowrap"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Aprobar y Acreditar</span>
                      </button>
                      <button
                        type="button"
                        disabled={actionId === activeTopup.id}
                        onClick={async () => {
                          setActionId(activeTopup.id);
                          try {
                            await onRejectTopup(activeTopup);
                          } finally {
                            setActionId(null);
                          }
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 text-red-700 hover:bg-red-50 font-semibold cursor-pointer whitespace-nowrap"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Rechazar</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Topup History Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 sm:px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-display text-base font-bold text-slate-900">
              Historial de Recargas (Cuentas Bancarias y QR)
            </h3>
            <p className="text-xs text-slate-500">
              {sortedTopups.length} solicitudes registradas en tiempo real
            </p>
          </div>
          <span className="text-xs text-slate-500 flex items-center gap-1 whitespace-nowrap">
            <Clock className="w-3.5 h-3.5" />
            Sincronizado
          </span>
        </div>

        {sortedTopups.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            No existen recargas registradas hasta el momento.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500">
                  <th className="py-2.5 px-4">Folio</th>
                  <th className="py-2.5 px-3">Método / Banco</th>
                  <th className="py-2.5 px-3">Unidad / Titular</th>
                  <th className="py-2.5 px-3">Fecha</th>
                  <th className="py-2.5 px-3 text-right">Monto</th>
                  <th className="py-2.5 px-3">Estado</th>
                  <th className="py-2.5 px-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {sortedTopups.map((topup) => (
                  <tr key={topup.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4 font-mono font-semibold text-slate-900 whitespace-nowrap">
                      {topup.referenceCode}
                    </td>
                    <td className="py-3 px-3">
                      {topup.method === 'bank_transfer' ? (
                        <div>
                          <div className="font-semibold text-slate-900">
                            Cuenta Bancaria · {topup.bankName} ••••{' '}
                            {topup.accountLast4}
                          </div>
                          {topup.transferReference && (
                            <div className="text-[11px] font-mono text-slate-500">
                              Ref: {topup.transferReference}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="font-medium text-slate-700">
                          Código QR Ventanilla
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      <div className="font-semibold text-slate-900">
                        {topup.motoName}
                      </div>
                      <div className="text-slate-500">{topup.riderName}</div>
                    </td>
                    <td className="py-3 px-3 text-slate-600 whitespace-nowrap">
                      {formatShortDate(topup.createdAt)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums font-bold text-slate-900 whitespace-nowrap">
                      {formatCurrency(topup.amount, tariffs.currency)}
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      <span
                        className={`font-semibold ${
                          topup.status === 'approved'
                            ? 'text-emerald-700'
                            : topup.status === 'rejected'
                            ? 'text-red-700'
                            : 'text-orange-700'
                        }`}
                      >
                        {TOPUP_STATUS_LABELS[topup.status]}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap space-x-2">
                      <button
                        type="button"
                        onClick={() => setSelectedTopupId(topup.id)}
                        className="px-2.5 py-1 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold cursor-pointer"
                      >
                        Ver Comprobante
                      </button>
                      {isAdminUser && topup.status === 'pending' && (
                        <button
                          type="button"
                          disabled={actionId === topup.id}
                          onClick={async () => {
                            setActionId(topup.id);
                            try {
                              await onApproveTopup(topup);
                            } finally {
                              setActionId(null);
                            }
                          }}
                          className="px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white font-semibold cursor-pointer"
                        >
                          Aprobar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
