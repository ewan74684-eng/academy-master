import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface Trainer {
  id: string;
  name: string;
  baseSalary: string;
}

interface TrainerAdvance {
  id: string;
  amount: string;
  status: "pending" | "deducted";
  notes?: string | null;
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
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trainer: Trainer | null;
  currentMonth: string; // YYYY-MM
  onPaid?: (payment: any) => void;
}

export default function AddSalaryPaymentModal({ open, onOpenChange, trainer, currentMonth, onPaid }: Props) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [amount, setAmount] = useState("");
  const [month, setMonth] = useState(currentMonth);
  const [notes, setNotes] = useState("");
  const [selectedAdvanceIds, setSelectedAdvanceIds] = useState<string[]>([]);

  useEffect(() => {
    setMonth(currentMonth);
    setAmount("");
    setNotes("");
    setSelectedAdvanceIds([]);
  }, [open, currentMonth]);

  // Fetch full ledger to get exact netPayable and advances for the selected month
  const { data: ledger, isLoading } = useQuery<LedgerData>({
    queryKey: ["/api/trainers", trainer?.id, "ledger", month],
    queryFn: async () => {
      if (!trainer || !month) return null;
      const res = await apiRequest("GET", `/api/trainers/${trainer.id}/ledger?month=${month}`);
      return res.json();
    },
    enabled: !!trainer && !!month && open,
  });

  const pendingAdvances = ledger?.advances.filter(a => a.status === "pending") || [];
  
  const toggleAdvance = (id: string) => {
    setSelectedAdvanceIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const autoSelectFIFO = () => {
    // Select all pending advances, they are already ordered desc in db, so we sort them asc by creation
    const sorted = [...pendingAdvances].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    setSelectedAdvanceIds(sorted.map(a => a.id));
  };

  // Preview numbers
  const remainingPayableBeforeThisPayment = ledger ? parseFloat(ledger.netPayable) : 0;
  
  const paid = parseFloat(amount || "0");
  
  // Actually, if we deduct an advance during this payment, it is being settled against the netPayable.
  // Wait, if I pay 1000 cash, it decreases remaining by 1000. 
  // If I deduct a 200 advance, it decreases remaining by 200? No, the pending advance was ALREADY subtracted from netPayable globally.
  // So deducting it just converts it from "Pending" to "Paid". It doesn't change the Net Payable remaining right now.
  const preview = Math.max(0, remainingPayableBeforeThisPayment - paid);

  const mutation = useMutation({
    mutationFn: async () => {
      if (paid > remainingPayableBeforeThisPayment + 0.01) {
        throw new Error("Payment exceeds net payable");
      }
      const res = await apiRequest("POST", `/api/trainers/${trainer!.id}/salary-payments`, {
        amount: parseFloat(amount),
        month,
        notes: notes || null,
        advanceIdsToDeduct: selectedAdvanceIds,
      });
      return await res.json();
    },
    onSuccess: (payment: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/trainers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/trainers", trainer?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/trainers-all-payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
      toast({ title: "Salary payment recorded", description: `AED ${amount} for ${trainer?.name}` });
      onOpenChange(false);
      // Auto-generate the payment receipt so the admin has proof of the transaction
      if (payment && payment.id) onPaid?.(payment);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !month || !trainer) return;
    mutation.mutate();
  };

  const isLocked = ledger?.isLocked;
  const isOverpaid = paid > remainingPayableBeforeThisPayment + 0.01;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">Record Salary Payment</DialogTitle>
          {trainer && (
            <p className="text-sm text-muted-foreground mt-1">
              Trainer: <strong>{trainer.name}</strong> · Base Salary: <strong>AED {parseFloat(trainer.baseSalary).toLocaleString()}</strong>
            </p>
          )}
        </DialogHeader>

        {isLocked ? (
          <div className="py-6 text-center text-red-600 bg-red-50 rounded-lg border border-red-200 mt-2">
            <p className="font-bold">This payroll month is locked.</p>
            <p className="text-sm">You cannot record new payments for {month}.</p>
            <Button className="mt-4" variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5 pt-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="salary-amount" className="flex justify-between">
                  Amount Paid (AED)
                  {!isLoading && ledger && remainingPayableBeforeThisPayment > 0 && (
                    <button 
                      type="button" 
                      onClick={() => setAmount(remainingPayableBeforeThisPayment.toFixed(2))}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      Pay Full
                    </button>
                  )}
                </Label>
                <Input
                  id="salary-amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder={isLoading ? "Loading..." : `Suggested: ${remainingPayableBeforeThisPayment.toFixed(2)}`}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className={isOverpaid ? "border-red-500 focus-visible:ring-red-500" : ""}
                  required
                />
                {isOverpaid && <p className="text-xs text-red-500">Exceeds remaining payable!</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="salary-month" className="flex items-center gap-2">
                  Salary Period
                </Label>
                <Input
                  id="salary-month"
                  type="month"
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Pending advances to deduct */}
            {pendingAdvances.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-2">
                    Deduct Pending Advances
                    <Badge variant="secondary">{pendingAdvances.length} pending</Badge>
                  </Label>
                  <button type="button" onClick={autoSelectFIFO} className="text-xs text-blue-600 hover:underline">
                    Auto-select Oldest (FIFO)
                  </button>
                </div>
                <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                  ⚠️ Selected advances are deducted from NetPayable separately.
                  Do <strong>not</strong> include advance amounts in the cash field above.
                </div>
                <div className="border rounded-lg divide-y max-h-48 overflow-y-auto">
                  {pendingAdvances.map((adv) => (
                    <div key={adv.id} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50">
                      <Checkbox
                        id={`adv-${adv.id}`}
                        checked={selectedAdvanceIds.includes(adv.id)}
                        onCheckedChange={() => toggleAdvance(adv.id)}
                      />
                      <label htmlFor={`adv-${adv.id}`} className="flex-1 text-sm cursor-pointer">
                        <span className="font-medium text-orange-600">AED {parseFloat(adv.amount).toLocaleString()}</span>
                        {adv.notes && <span className="ml-2 text-gray-500">· {adv.notes}</span>}
                        <span className="ml-2 text-xs text-gray-400">
                          {new Date(adv.createdAt).toLocaleDateString()}
                        </span>
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Notes */}
            <div className="space-y-1.5">
              <Label htmlFor="salary-notes">Notes (optional)</Label>
              <Textarea
                id="salary-notes"
                placeholder="e.g. Full month salary"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </div>

            {/* Net payable preview */}
            {trainer && ledger && (
              <div className="bg-blue-50 rounded-lg p-3 text-sm space-y-1 border border-blue-100">
                <div className="flex justify-between text-gray-600">
                  <span>Net Payable (before this payment)</span>
                  <span>AED {remainingPayableBeforeThisPayment.toLocaleString()}</span>
                </div>
                {paid > 0 && (
                  <div className="flex justify-between text-emerald-600">
                    <span>Cash to Hand Employee</span>
                    <span>− AED {paid.toLocaleString()}</span>
                  </div>
                )}
                {selectedAdvanceIds.length > 0 && (
                  <div className="flex justify-between text-orange-600">
                    <span>Advances to Deduct (status change only)</span>
                    <span>− AED {
                      pendingAdvances
                        .filter(a => selectedAdvanceIds.includes(a.id))
                        .reduce((s, a) => s + parseFloat(a.amount), 0)
                        .toLocaleString()
                    }</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-blue-800 border-t pt-1 mt-1">
                  <span>Remaining After Cash Payment</span>
                  <span className={preview < 0 ? "text-red-600" : ""}>AED {preview.toLocaleString()}</span>
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                disabled={mutation.isPending || isOverpaid}
              >
                {mutation.isPending ? "Saving…" : "Record Payment"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
