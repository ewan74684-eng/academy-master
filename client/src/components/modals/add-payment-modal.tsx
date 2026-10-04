import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { PAYMENT_METHODS } from "@/lib/constants";
import { format } from "date-fns";
import PlayerSearchInput from "@/components/ui/player-search-input";

const addPaymentSchema = z.object({
  playerId: z.string().min(1, "Player selection is required"),
  amountPaid: z.string().min(1, "Amount paid is required"),
  paymentMethod: z.string().min(1, "Payment method is required"),
  description: z.string().optional(),
});

type AddPaymentForm = z.infer<typeof addPaymentSchema>;

interface AddPaymentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedPlayerId?: string;
  /** Offered when the current subscription is already fully paid, so the payment is taken as a renewal instead */
  onRenewPlayer?: (playerId: string) => void;
}

export default function AddPaymentModal({ open, onOpenChange, selectedPlayerId, onRenewPlayer }: AddPaymentModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch players for selection
  const { data: players } = useQuery({
    queryKey: ["/api/players"],
    enabled: open,
  });

  const form = useForm<AddPaymentForm>({
    resolver: zodResolver(addPaymentSchema),
    defaultValues: {
      playerId: selectedPlayerId || "",
      amountPaid: "",
      paymentMethod: "",
      description: "",
    },
  });

  const watchPlayerId = form.watch("playerId");

  // Fetch selected player's payment details
  const { data: playerPayments } = useQuery({
    queryKey: ["/api/payments", "player", watchPlayerId],
    queryFn: async () => {
      if (!watchPlayerId) return [];
      const response = await fetch(`/api/payments?playerId=${watchPlayerId}`);
      if (!response.ok) throw new Error('Failed to fetch payments');
      return response.json();
    },
    enabled: !!watchPlayerId && open,
  });

  const createPaymentMutation = useMutation({
    // The server works out the fee, balance and receipt number itself
    mutationFn: async (data: AddPaymentForm) =>
      apiRequest("POST", "/api/payments", {
        playerId: data.playerId,
        amountPaid: data.amountPaid,
        paymentMethod: data.paymentMethod,
        description: data.description || `Additional payment - ${format(new Date(), 'MMM dd, yyyy')}`,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/players"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/recent-activities"] });
      toast({
        title: "Success",
        description: "Payment added successfully",
      });
      onOpenChange(false);
      form.reset();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Calculate payment summary for selected player (same rule as the server: refunded amounts don't count as paid)
  const selectedPlayer = (players as any)?.find((p: any) => p.id === watchPlayerId);
  const totalPaidSoFar = (playerPayments as any)?.reduce((sum: number, payment: any) =>
    sum + parseFloat(payment.amountPaid) - parseFloat(payment.totalRefunded || '0'), 0) || 0;
  const subscriptionFee = selectedPlayer ? parseFloat(selectedPlayer.finalPrice ?? selectedPlayer.monthlySubscriptionFee) : 0;
  const remainingBalance = Math.max(0, Math.round((subscriptionFee - totalPaidSoFar) * 100) / 100);
  const isFullyPaid = !!selectedPlayer && !!playerPayments && remainingBalance <= 0;

  const onSubmit = (data: AddPaymentForm) => {
    const amount = parseFloat(data.amountPaid);
    if (!(amount > 0)) {
      form.setError("amountPaid", { message: "Amount must be greater than zero" });
      return;
    }
    if (amount > remainingBalance) {
      form.setError("amountPaid", { message: `Maximum payment allowed: AED ${remainingBalance.toFixed(2)}` });
      return;
    }
    createPaymentMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold text-gray-900">
            Add Payment
          </DialogTitle>
          <DialogDescription>
            Record a new payment for a player's subscription or activity fees.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Player Search */}
            <FormField
              control={form.control}
              name="playerId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Search Player *</FormLabel>
                  <PlayerSearchInput
                    players={players as any || []}
                    onPlayerSelect={(playerId) => {
                      field.onChange(playerId);
                    }}
                    selectedPlayerId={field.value}
                  />
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Payment Summary */}
            {selectedPlayer && (
              <div className="bg-gray-50 p-4 rounded-lg space-y-4">
                <div>
                  <h4 className="font-medium text-gray-900 mb-2">Payment Summary</h4>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span>Monthly Subscription Fee:</span>
                      <span className="font-medium">AED {subscriptionFee.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Total Paid So Far:</span>
                      <span className="font-medium">AED {totalPaidSoFar.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between border-t pt-1">
                      <span>Remaining Balance:</span>
                      <span className={`font-medium ${remainingBalance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        AED {remainingBalance.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>

                {isFullyPaid && (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    <span>This subscription is already fully paid. To take a new payment, renew the subscription.</span>
                    {onRenewPlayer && (
                      <Button
                        type="button"
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-700 text-white shrink-0"
                        onClick={() => {
                          onOpenChange(false);
                          form.reset();
                          onRenewPlayer(selectedPlayer.id);
                        }}
                      >
                        Renew Subscription
                      </Button>
                    )}
                  </div>
                )}

                {/* History View */}
                {playerPayments && (playerPayments as any[]).length > 0 && (
                  <div className="border-t border-gray-200 pt-3">
                    <h5 className="text-xs font-semibold text-gray-700 uppercase mb-2">Previous Payments</h5>
                    <div className="max-h-32 overflow-y-auto space-y-2 pr-1">
                      {([...playerPayments as any[]])
                        .sort((a, b) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime())
                        .map((p: any) => (
                          <div key={p.id} className="flex justify-between items-center bg-white p-2 rounded border text-xs">
                            <div>
                              <div className="font-medium">{format(new Date(p.paymentDate), 'MMM dd, yyyy')}</div>
                              <div className="text-gray-500">{p.receiptNumber}</div>
                            </div>
                            <div className="text-right">
                              <div className="font-bold text-green-600">AED {p.amountPaid}</div>
                              <div className="text-gray-500">{PAYMENT_METHODS[p.paymentMethod as keyof typeof PAYMENT_METHODS]?.label || p.paymentMethod}</div>
                            </div>
                          </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Payment Details */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="amountPaid"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Amount Paid (AED) *</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        step="0.01" 
                        min="0"
                        placeholder="0.00" 
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="paymentMethod"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Payment Method *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select method" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Object.entries(PAYMENT_METHODS).map(([key, method]) => (
                          <SelectItem key={key} value={key}>
                            {method.icon} {method.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Description */}
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (Optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="Additional payment details..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Action Buttons */}
            <div className="flex justify-end space-x-4 pt-6 border-t border-gray-200">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-academy-blue hover:bg-academy-blue-light text-white"
                disabled={createPaymentMutation.isPending || isFullyPaid}
              >
                {createPaymentMutation.isPending ? "Adding..." : "Add Payment"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}