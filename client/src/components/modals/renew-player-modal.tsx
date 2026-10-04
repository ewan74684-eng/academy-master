import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { format, addMonths } from "date-fns";
import { PAYMENT_METHODS } from "@/lib/constants";
import { addOneMonth } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  playerId: string | null;
}

export default function RenewPlayerModal({ open, onOpenChange, playerId }: Props) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: player } = useQuery<any>({
    queryKey: ["/api/players", playerId],
    enabled: !!playerId && open,
  });

  const today = format(new Date(), "yyyy-MM-dd");
  const nextMonth = format(addMonths(new Date(), 1), "yyyy-MM-dd");

  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(nextMonth);
  const [fee, setFee] = useState("");
  const [sessions, setSessions] = useState("");
  const [amountPaid, setAmountPaid] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");

  useEffect(() => {
    if (player && open) {
      setStartDate(today);
      setEndDate(nextMonth);
      setFee(parseFloat(player.monthlySubscriptionFee).toFixed(2));
      setSessions(String(player.totalSessionsAllowed));
      setAmountPaid("");
      setPaymentMethod("cash");
    }
  }, [player, open]);

  const mutation = useMutation({
    mutationFn: async () => {
      const paid = parseFloat(amountPaid || "0");
      return apiRequest("POST", `/api/players/${playerId}/renew`, {
        subscriptionStartDate: startDate,
        subscriptionEndDate: endDate,
        subscriptionFee: fee,
        totalSessionsAllowed: parseInt(sessions),
        amountPaid: paid,
        paymentMethod: paid > 0 ? paymentMethod : undefined,
        description: "Subscription renewal",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/players"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/upcoming-renewals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payments/history"] });
      toast({ title: "Subscription renewed", description: `${player?.fullName}'s subscription has been renewed.` });
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const paid = parseFloat(amountPaid || "0");
  const feeNum = parseFloat(fee || "0");
  // The server charges the renewal at the fee after the player's discount
  const discount = Math.min(100, Math.max(0, parseFloat(player?.discountPercentage || "0") || 0));
  const amountDue = Math.max(0, feeNum * (1 - discount / 100));
  const remaining = Math.max(0, amountDue - paid);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Renew Subscription</DialogTitle>
          {player && (
            <p className="text-sm text-muted-foreground mt-1">
              <strong>{player.fullName}</strong> · {player.activity}
            </p>
          )}
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Start Date</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setEndDate(addOneMonth(e.target.value));
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label>End Date</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>

          {/* Fee & Sessions */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Subscription Fee (AED)</Label>
              <Input type="number" min="0" step="0.01" value={fee} onChange={(e) => setFee(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Sessions Allowed</Label>
              <Input type="number" min="1" value={sessions} onChange={(e) => setSessions(e.target.value)} />
            </div>
          </div>

          {/* Payment */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Amount Paid Now (AED)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={amountPaid}
                onChange={(e) => setAmountPaid(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Payment Method</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PAYMENT_METHODS).map(([key, m]) => (
                    <SelectItem key={key} value={key}>
                      {m.icon} {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Summary */}
          {feeNum > 0 && (
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-sm space-y-1">
              <div className="flex justify-between text-gray-600">
                <span>Subscription Fee</span>
                <span>AED {feeNum.toFixed(2)}</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-gray-600">
                  <span>After {discount}% discount</span>
                  <span>AED {amountDue.toFixed(2)}</span>
                </div>
              )}
              {paid > 0 && (
                <div className="flex justify-between text-emerald-600">
                  <span>Paid Now</span>
                  <span>− AED {paid.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-blue-800 border-t pt-1 mt-1">
                <span>Remaining Balance</span>
                <span className={remaining > 0 ? "text-amber-600" : "text-green-600"}>
                  AED {remaining.toFixed(2)}
                </span>
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={mutation.isPending || !fee || !sessions || !startDate || !endDate}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? "Renewing…" : "Confirm Renewal"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
