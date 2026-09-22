import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface Trainer {
  id: string;
  name: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trainer: Trainer | null;
  currentMonth: string;
}

export default function AddBonusModal({ open, onOpenChange, trainer, currentMonth }: Props) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [amount, setAmount] = useState("");
  const [month, setMonth] = useState(currentMonth);
  const [note, setNote] = useState("");

  useEffect(() => {
    setMonth(currentMonth);
    setAmount("");
    setNote("");
  }, [open, currentMonth]);

  const mutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", `/api/trainers/${trainer!.id}/bonuses`, {
        amount: parseFloat(amount),
        month,
        note: note || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trainers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/trainers", trainer?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/trainers-all-bonuses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({ title: "Bonus recorded", description: `Added AED ${amount} for ${trainer?.name}` });
      onOpenChange(false);
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Bonus</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          {trainer && (
            <div className="bg-emerald-50 rounded p-3 text-sm border border-emerald-100">
              <span className="font-medium">Employee:</span> {trainer.name}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="bonus-amount">Amount (AED)</Label>
              <Input
                id="bonus-amount"
                type="number"
                min="0.01"
                step="0.01"
                placeholder="e.g. 500"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bonus-month">Payroll Month</Label>
              <Input
                id="bonus-month"
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bonus-note">Note (optional)</Label>
            <Textarea
              id="bonus-note"
              placeholder="e.g. Excellent performance"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving..." : "Add Bonus"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
