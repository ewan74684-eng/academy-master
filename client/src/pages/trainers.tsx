import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Plus,
  Pencil,
  Trash2,
  Wallet,
  HandCoins,
  ChevronDown,
  ChevronUp,
  GraduationCap,
  TrendingDown,
  CheckCircle2,
  Clock3,
  Gift,
  Lock,
  LockOpen,
  Receipt,
  RotateCcw
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { TRAINER_ROLE_DISPLAY } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import AddTrainerModal from "@/components/modals/add-trainer-modal";
import AddSalaryPaymentModal from "@/components/modals/add-salary-payment-modal";
import AddAdvanceModal from "@/components/modals/add-advance-modal";
import AddBonusModal from "@/components/modals/add-bonus-modal";
import TrainerReceiptModal from "@/components/modals/trainer-receipt-modal";

// ─── Types ──────────────────────────────────────────────────────────────────

interface Trainer {
  id: string;
  name: string;
  activity: string;
  baseSalary: string;
  createdAt: string;
}

interface TrainerSalaryPayment {
  id: string;
  trainerId: string;
  amount: string;
  month: string;
  notes?: string | null;
  createdAt: string;
}

interface TrainerAdvance {
  id: string;
  trainerId: string;
  amount: string;
  status: "pending" | "deducted" | "repaid";
  notes?: string | null;
  deductedAt?: string | null;
  createdAt: string;
}

interface TrainerBonus {
  id: string;
  trainerId: string;
  amount: string;
  month: string;
  note?: string | null;
  createdAt: string;
}

interface LedgerData {
  baseSalary: string;
  carryForward: string;
  totalBonuses: string;
  totalPendingAdvances: string;
  totalPaid: string;
  netPayable: string;
  status: "unpaid" | "partial" | "paid" | "over_advanced";
  isLocked: boolean;
  advances: TrainerAdvance[];
  payments: TrainerSalaryPayment[];
  bonuses: TrainerBonus[];
}

// ─── Helper: current month YYYY-MM ──────────────────────────────────────────
function currentMonthStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// ─── Trainer Card (expandable ledger) ───────────────────────────────────────
function TrainerCard({
  trainer,
  month,
  onEdit,
  onDelete,
  onSalary,
  onAdvance,
  onBonus,
  onPrintReceipt,
}: {
  trainer: Trainer;
  month: string;
  onEdit: (t: Trainer) => void;
  onDelete: (t: Trainer) => void;
  onSalary: (t: Trainer) => void;
  onAdvance: (t: Trainer) => void;
  onBonus: (t: Trainer) => void;
  onPrintReceipt: (payment: TrainerSalaryPayment, trainer: Trainer, ledgerAdvances: TrainerAdvance[]) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: ledger, isLoading } = useQuery<LedgerData>({
    queryKey: ["/api/trainers", trainer.id, "ledger", month],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/trainers/${trainer.id}/ledger?month=${month}`);
      return res.json();
    },
    enabled: true, // we need it for the summary even if not expanded to show status badge
  });

  const lockMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", `/api/trainers/${trainer.id}/payrolls/lock`, { month });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trainers", trainer.id, "ledger", month] });
      toast({ title: "Payroll Locked", description: `${month} locked for ${trainer.name}.` });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const repayMutation = useMutation({
    mutationFn: async (advanceId: string) => {
      return await apiRequest("POST", `/api/trainers/${trainer.id}/advances/${advanceId}/repay`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trainers", trainer.id, "ledger"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({ title: "Advance Repaid", description: "The advance was marked as repaid in cash." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const activity = TRAINER_ROLE_DISPLAY[trainer.activity as keyof typeof TRAINER_ROLE_DISPLAY];

  // Status Colors
  const statusColors = {
    unpaid: "bg-gray-100 text-gray-700 border-gray-200",
    partial: "bg-blue-100 text-blue-700 border-blue-200",
    paid: "bg-green-100 text-green-700 border-green-200",
    over_advanced: "bg-red-100 text-red-700 border-red-200",
  };

  return (
    <Card className="overflow-hidden border-0 shadow-md hover:shadow-lg transition-shadow">
      <CardHeader className="pb-3 bg-gradient-to-r from-slate-50 to-blue-50">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
              {trainer.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <CardTitle className="text-base font-semibold text-gray-900 truncate flex items-center gap-2">
                {trainer.name}
                {ledger?.isLocked && <Lock className="h-3 w-3 text-red-500" />}
              </CardTitle>
              <p className="text-xs text-gray-500">
                {activity?.emoji} {activity?.label}
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center justify-end gap-1.5 max-w-[140px]">
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => onEdit(trainer)}>
              <Pencil className="h-3.5 w-3.5 text-gray-500" />
            </Button>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => onDelete(trainer)}>
              <Trash2 className="h-3.5 w-3.5 text-red-500" />
            </Button>
            <Button size="sm" variant="outline" className="h-7 px-2 text-xs w-full justify-start bg-white" onClick={() => onSalary(trainer)}>
              <Wallet className="h-3 w-3 mr-1" /> Salary
            </Button>
            <Button size="sm" variant="outline" className="h-7 px-2 text-xs w-full justify-start bg-white" onClick={() => onBonus(trainer)}>
              <Gift className="h-3 w-3 mr-1" /> Bonus
            </Button>
            <Button size="sm" variant="outline" className="h-7 px-2 text-xs w-full justify-start bg-white" onClick={() => onAdvance(trainer)}>
              <HandCoins className="h-3 w-3 mr-1" /> Advance
            </Button>
          </div>
        </div>

        {/* Quick stat strip */}
        <div className="grid grid-cols-2 gap-2 mt-3">
          <div className="bg-white rounded-lg p-2 text-center shadow-sm relative">
            <p className="text-xs text-gray-500">Net Payable</p>
            {isLoading ? (
              <div className="h-5 w-16 bg-gray-200 animate-pulse mx-auto mt-1 rounded"></div>
            ) : (
              <p className={`text-sm font-bold ${parseFloat(ledger!.netPayable) < 0 ? 'text-red-600' : 'text-blue-700'}`}>
                AED {parseFloat(ledger!.netPayable).toLocaleString()}
              </p>
            )}
            {ledger && (
              <Badge className={`absolute -top-2 -right-2 text-[9px] px-1 py-0 border ${statusColors[ledger.status]}`}>
                {ledger.status.replace('_', ' ')}
              </Badge>
            )}
          </div>
          <button
            onClick={() => setExpanded((p) => !p)}
            className="bg-blue-600 hover:bg-blue-700 rounded-lg p-2 text-center text-white transition-colors flex items-center justify-center gap-1"
          >
            <span className="text-xs font-medium">
              {expanded ? "Hide Ledger" : "View Ledger"}
            </span>
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
        </div>
      </CardHeader>

      {/* Expandable ledger */}
      {expanded && (
        <CardContent className="pt-0 pb-4">
          {isLoading ? (
            <div className="text-center py-6 text-sm text-gray-500">Loading ledger…</div>
          ) : ledger ? (
            <div className="space-y-4 pt-4">
              {/* Ledger Math Details */}
              <div className="bg-gray-50 rounded-lg p-3 text-xs space-y-1.5 border border-gray-100">
                <div className="flex justify-between text-gray-600">
                  <span>Base Salary</span>
                  <span>AED {parseFloat(ledger.baseSalary).toLocaleString()}</span>
                </div>
                {parseFloat(ledger.carryForward) !== 0 && (
                  <div className="flex justify-between text-purple-600">
                    <span>Carry Forward (Prior Unpaid)</span>
                    <span>AED {parseFloat(ledger.carryForward).toLocaleString()}</span>
                  </div>
                )}
                {parseFloat(ledger.totalBonuses) > 0 && (
                  <div className="flex justify-between text-emerald-600">
                    <span>Bonuses</span>
                    <span>+ AED {parseFloat(ledger.totalBonuses).toLocaleString()}</span>
                  </div>
                )}
                {parseFloat(ledger.totalPendingAdvances) > 0 && (
                  <div className="flex justify-between text-orange-600">
                    <span>Global Pending Advances</span>
                    <span>− AED {parseFloat(ledger.totalPendingAdvances).toLocaleString()}</span>
                  </div>
                )}
                {parseFloat(ledger.totalPaid) > 0 && (
                  <div className="flex justify-between text-green-600 border-b border-gray-200 pb-1">
                    <span>Settled This Month</span>
                    <span>− AED {parseFloat(ledger.totalPaid).toLocaleString()}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold pt-1">
                  <span className="text-gray-800">Remaining Payable</span>
                  <span className={parseFloat(ledger.netPayable) < 0 ? "text-red-600" : "text-blue-700"}>
                    AED {parseFloat(ledger.netPayable).toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Advances list */}
              {ledger.advances.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Advances</p>
                  <div className="space-y-1.5">
                    {ledger.advances.map((adv) => (
                      <div key={adv.id} className="flex items-center justify-between text-sm bg-gray-50 rounded-lg px-3 py-2">
                        <div className="flex items-center gap-2">
                          {adv.status === "pending" ? (
                            <Clock3 className="h-3.5 w-3.5 text-orange-500" />
                          ) : (
                            <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                          )}
                          <span className="font-medium">AED {parseFloat(adv.amount).toLocaleString()}</span>
                          {adv.notes && <span className="text-gray-400 text-xs">· {adv.notes}</span>}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-400">
                            {new Date(adv.createdAt).toLocaleDateString()}
                          </span>
                          <Badge
                            variant={adv.status === "pending" ? "outline" : "secondary"}
                            className={`text-[10px] ${
                              adv.status === "pending" 
                                ? "border-orange-400 text-orange-600" 
                                : adv.status === "repaid"
                                ? "bg-purple-50 text-purple-700"
                                : "text-green-700 bg-green-50"
                            }`}
                          >
                            {adv.status}
                          </Badge>
                          {adv.status === "pending" && !ledger.isLocked && (
                            <Button 
                              size="sm" 
                              variant="ghost" 
                              className="h-6 w-6 p-0 text-gray-400 hover:text-purple-600 ml-1"
                              title="Mark as Repaid (Cash)"
                              onClick={() => {
                                if (confirm("Mark this advance as repaid in cash by the trainer? This will remove it from pending deductions.")) {
                                  repayMutation.mutate(adv.id);
                                }
                              }}
                              disabled={repayMutation.isPending}
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Bonuses list */}
              {ledger.bonuses.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Bonuses</p>
                  <div className="space-y-1.5">
                    {ledger.bonuses.map((b) => (
                      <div key={b.id} className="flex items-center justify-between text-sm bg-emerald-50 rounded-lg px-3 py-2">
                        <div className="flex items-center gap-2">
                          <Gift className="h-3.5 w-3.5 text-emerald-600" />
                          <span className="font-medium text-emerald-800">AED {parseFloat(b.amount).toLocaleString()}</span>
                          {b.note && <span className="text-gray-400 text-xs">· {b.note}</span>}
                        </div>
                        <span className="text-xs text-gray-400">
                          {new Date(b.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Salary payments list */}
              {ledger.payments.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
                    Salary Payments — {month}
                  </p>
                  <div className="space-y-1.5">
                    {ledger.payments.map((p) => (
                      <div key={p.id} className="flex items-center justify-between text-sm bg-blue-50 rounded-lg px-3 py-2">
                        <div className="flex items-center gap-2">
                          <Wallet className="h-3.5 w-3.5 text-blue-600" />
                          <span className="font-medium text-blue-800">AED {parseFloat(p.amount).toLocaleString()}</span>
                          {p.notes && <span className="text-gray-400 text-xs">· {p.notes}</span>}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-400">
                            {new Date(p.createdAt).toLocaleDateString()}
                          </span>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-6 px-2 text-xs text-blue-600 hover:bg-blue-100 p-0 ml-1"
                            onClick={() => onPrintReceipt(p, trainer, ledger.advances)}
                          >
                            <Receipt className="h-3.5 w-3.5 mr-1" /> Print
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="pt-3 border-t">
                {ledger.isLocked ? (
                  <div className="flex items-center justify-center gap-2 text-sm text-red-600 bg-red-50 py-2 rounded font-medium">
                    <Lock className="h-4 w-4" /> Month Locked
                  </div>
                ) : (
                  <Button 
                    variant="outline" 
                    className="w-full text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                    onClick={() => {
                      if (confirm(`Lock payroll for ${month}? No further payments, advances, or bonuses can be added for this month.`)) {
                        lockMutation.mutate();
                      }
                    }}
                    disabled={lockMutation.isPending}
                  >
                    <LockOpen className="h-4 w-4 mr-2" /> 
                    {lockMutation.isPending ? "Locking..." : "Lock Payroll Month"}
                  </Button>
                )}
              </div>
            </div>
          ) : null}
        </CardContent>
      )}
    </Card>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function Trainers() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [month, setMonth] = useState(currentMonthStr());
  const [filterTrainer, setFilterTrainer] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");

  // Modals
  const [showAddTrainer, setShowAddTrainer] = useState(false);
  const [editingTrainer, setEditingTrainer] = useState<Trainer | null>(null);
  const [salaryTrainer, setSalaryTrainer] = useState<Trainer | null>(null);
  const [advanceTrainer, setAdvanceTrainer] = useState<Trainer | null>(null);
  const [bonusTrainer, setBonusTrainer] = useState<Trainer | null>(null);
  
  const [receiptPayment, setReceiptPayment] = useState<{
    payment: TrainerSalaryPayment;
    trainer: Trainer;
    advances: TrainerAdvance[];
  } | null>(null);

  // Queries
  const { data: trainers = [], isLoading } = useQuery<Trainer[]>({
    queryKey: ["/api/trainers"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/trainers");
      return res.json();
    },
  });

  // Global transactions for Tab 2
  const { data: allPayments = [] } = useQuery<(TrainerSalaryPayment & { trainerName?: string })[]>({
    queryKey: ["/api/trainers-all-payments", month, filterTrainer],
    queryFn: async () => {
      const trainersToFetch = filterTrainer === "all" ? trainers : trainers.filter((t) => t.id === filterTrainer);
      const results = await Promise.all(
        trainersToFetch.map(async (t) => {
          const res = await apiRequest("GET", `/api/trainers/${t.id}/salary-payments?month=${month}`);
          const payments = await res.json();
          return (payments as TrainerSalaryPayment[]).map((p) => ({ ...p, trainerName: t.name }));
        })
      );
      return results.flat();
    },
    enabled: trainers.length > 0,
  });

  const { data: allAdvances = [] } = useQuery<(TrainerAdvance & { trainerName?: string })[]>({
    queryKey: ["/api/trainers-all-advances", filterTrainer],
    queryFn: async () => {
      const trainersToFetch = filterTrainer === "all" ? trainers : trainers.filter((t) => t.id === filterTrainer);
      const results = await Promise.all(
        trainersToFetch.map(async (t) => {
          const res = await apiRequest("GET", `/api/trainers/${t.id}/advances`);
          const advances = await res.json();
          return (advances as TrainerAdvance[]).map((a) => ({ ...a, trainerName: t.name }));
        })
      );
      return results.flat();
    },
    enabled: trainers.length > 0,
  });

  const { data: allBonuses = [] } = useQuery<(TrainerBonus & { trainerName?: string })[]>({
    queryKey: ["/api/trainers-all-bonuses", month, filterTrainer],
    queryFn: async () => {
      const trainersToFetch = filterTrainer === "all" ? trainers : trainers.filter((t) => t.id === filterTrainer);
      const results = await Promise.all(
        trainersToFetch.map(async (t) => {
          const res = await apiRequest("GET", `/api/trainers/${t.id}/bonuses?month=${month}`);
          const bonuses = await res.json();
          return (bonuses as TrainerBonus[]).map((b) => ({ ...b, trainerName: t.name }));
        })
      );
      return results.flat();
    },
    enabled: trainers.length > 0,
  });

  // Delete
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/trainers/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trainers"] });
      toast({ title: "Trainer deleted" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const confirmDelete = (trainer: Trainer) => {
    if (window.confirm(`Delete trainer "${trainer.name}"? This will also remove all their records.`)) {
      deleteMutation.mutate(trainer.id);
    }
  };

  // Combine and filter transactions for Tab 2
  const transactions = [
    ...(filterType === "all" || filterType === "salary" ? allPayments.map((p) => ({ ...p, type: "salary" as const })) : []),
    ...(filterType === "all" || filterType === "advance" ? allAdvances.map((a) => ({ ...a, type: "advance" as const })) : []),
    ...(filterType === "all" || filterType === "bonus" ? allBonuses.map((b) => ({ ...b, type: "bonus" as const })) : []),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <>
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200 px-4 sm:px-8 py-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <GraduationCap className="h-6 w-6 sm:h-7 sm:w-7 text-blue-600 shrink-0" />
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Payroll Engine</h2>
              <p className="text-xs sm:text-sm text-gray-500">Trainers Salary & Adjustments</p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <div className="flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded-lg border flex-1 sm:flex-none">
              <Label className="text-xs sm:text-sm font-semibold text-gray-700 whitespace-nowrap">Period:</Label>
              <Input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="w-full sm:w-40 h-8 text-sm"
              />
            </div>
            <Button
              onClick={() => { setEditingTrainer(null); setShowAddTrainer(true); }}
              className="bg-blue-600 hover:bg-blue-700 text-white shrink-0"
            >
              <Plus className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Add Trainer</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-50 p-4 sm:p-8">
        <Tabs defaultValue="trainers">
          <TabsList className="mb-6">
            <TabsTrigger value="trainers">
              <GraduationCap className="h-4 w-4 mr-2" />
              Trainers ({trainers.length})
            </TabsTrigger>
            <TabsTrigger value="transactions">
              <TrendingDown className="h-4 w-4 mr-2" />
              All Transactions
            </TabsTrigger>
          </TabsList>

          {/* ─── Tab 1: Trainer list ─── */}
          <TabsContent value="trainers">
            {isLoading ? (
              <div className="text-center py-20 text-gray-500">Loading trainers…</div>
            ) : trainers.length === 0 ? (
              <div className="text-center py-20">
                <GraduationCap className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 text-lg font-medium">No trainers yet</p>
                <p className="text-gray-400 text-sm mt-1">Click "Add Trainer" to get started.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5">
                {trainers.map((trainer) => (
                  <TrainerCard
                    key={trainer.id}
                    trainer={trainer}
                    month={month}
                    onEdit={(t) => { setEditingTrainer(t); setShowAddTrainer(true); }}
                    onDelete={confirmDelete}
                    onSalary={setSalaryTrainer}
                    onAdvance={setAdvanceTrainer}
                    onBonus={setBonusTrainer}
                    onPrintReceipt={(payment, trainer, advances) => {
                      setReceiptPayment({ payment, trainer, advances });
                    }}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {/* ─── Tab 2: Global transactions ─── */}
          <TabsContent value="transactions">
            {/* Filters */}
            <div className="flex flex-col sm:flex-row flex-wrap gap-3 mb-6">
              <Select value={filterTrainer} onValueChange={setFilterTrainer}>
                <SelectTrigger className="w-full sm:w-48 bg-white">
                  <SelectValue placeholder="Filter by trainer…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Trainers</SelectItem>
                  {trainers.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-full sm:w-44 bg-white">
                  <SelectValue placeholder="Type…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="salary">Salary Payments</SelectItem>
                  <SelectItem value="advance">Advances</SelectItem>
                  <SelectItem value="bonus">Bonuses</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Table */}
            <Card className="border-0 shadow-md">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b">
                      <th className="text-left py-3 px-4 font-semibold text-gray-600">Date</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-600">Trainer</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-600">Type</th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-600">Amount (AED)</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-600">Status / Period</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-600">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {transactions.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center py-12 text-gray-400">
                          No transactions found for the selected filters.
                        </td>
                      </tr>
                    ) : (
                      transactions.map((tx) => (
                        <tr key={tx.id} className="hover:bg-gray-50 transition-colors">
                          <td className="py-3 px-4 text-gray-600">
                            {new Date(tx.createdAt).toLocaleDateString()}
                          </td>
                          <td className="py-3 px-4 font-medium text-gray-900">
                            {(tx as any).trainerName ?? "—"}
                          </td>
                          <td className="py-3 px-4">
                            <Badge
                              className={`text-xs ${
                                tx.type === "salary"
                                  ? "bg-blue-100 text-blue-700 hover:bg-blue-200"
                                  : tx.type === "bonus"
                                  ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                                  : "bg-orange-100 text-orange-700 hover:bg-orange-200"
                              }`}
                            >
                              {tx.type === "salary" ? (
                                <><Wallet className="h-3 w-3 mr-1" /> Salary</>
                              ) : tx.type === "bonus" ? (
                                <><Gift className="h-3 w-3 mr-1" /> Bonus</>
                              ) : (
                                <><HandCoins className="h-3 w-3 mr-1" /> Advance</>
                              )}
                            </Badge>
                          </td>
                          <td className="py-3 px-4 text-right font-semibold">
                            {parseFloat(tx.amount).toLocaleString()}
                          </td>
                          <td className="py-3 px-4">
                            {tx.type === "salary" || tx.type === "bonus" ? (
                              <Badge variant="outline" className="text-xs text-gray-600 border-gray-300">
                                For: {(tx as any).month}
                              </Badge>
                            ) : (
                              <Badge
                                variant={(tx as TrainerAdvance).status === "pending" ? "outline" : "secondary"}
                                className={`text-[10px] ${
                                  (tx as TrainerAdvance).status === "pending"
                                    ? "border-orange-400 text-orange-600"
                                    : "bg-green-50 text-green-700"
                                }`}
                              >
                                {(tx as TrainerAdvance).status}
                              </Badge>
                            )}
                          </td>
                          <td className="py-3 px-4 text-gray-500 text-xs">
                            {(tx as any).notes || (tx as any).note || "—"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      {/* Modals */}
      <AddTrainerModal
        open={showAddTrainer}
        onOpenChange={(v) => { setShowAddTrainer(v); if (!v) setEditingTrainer(null); }}
        trainer={editingTrainer}
      />
      <AddSalaryPaymentModal
        open={!!salaryTrainer}
        onOpenChange={(v) => { if (!v) setSalaryTrainer(null); }}
        trainer={salaryTrainer}
        currentMonth={month}
        onPaid={(payment) => {
          if (salaryTrainer) {
            setReceiptPayment({ payment, trainer: salaryTrainer as any, advances: [] });
          }
        }}
      />
      <AddAdvanceModal
        open={!!advanceTrainer}
        onOpenChange={(v) => { if (!v) setAdvanceTrainer(null); }}
        trainer={advanceTrainer}
      />
      <AddBonusModal
        open={!!bonusTrainer}
        onOpenChange={(v) => { if (!v) setBonusTrainer(null); }}
        trainer={bonusTrainer}
        currentMonth={month}
      />
      {receiptPayment && (
        <TrainerReceiptModal
          open={!!receiptPayment}
          onOpenChange={(v) => { if (!v) setReceiptPayment(null); }}
          trainer={receiptPayment.trainer}
          payment={receiptPayment.payment}
          advances={receiptPayment.advances}
        />
      )}
    </>
  );
}
