import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Receipt, Calendar, Filter, RotateCcw } from "lucide-react";
import { PAYMENT_METHODS, PAYMENT_STATUS_COLORS } from "@/lib/constants";
import { format, startOfMonth, subMonths, parseISO } from "date-fns";
import { getMonthRange } from "@/lib/utils";
import ReceiptModal from "@/components/modals/receipt-modal";
import ViewPlayerModal from "@/components/modals/view-player-modal";
import RefundPaymentModal from "@/components/modals/refund-payment-modal";

interface PaymentRecordsProps {
  month: string; // 'YYYY-MM'
  onMonthChange: (month: string) => void;
  playerId: string; // "all" or a player id
  onPlayerChange: (playerId: string) => void;
}

export default function PaymentRecords({
  month: selectedMonth,
  onMonthChange: setSelectedMonth,
  playerId: selectedPlayer,
  onPlayerChange: setSelectedPlayer,
}: PaymentRecordsProps) {
  const [receiptModalOpen, setReceiptModalOpen] = useState(false);
  const [viewPlayerModalOpen, setViewPlayerModalOpen] = useState(false);
  const [refundModalOpen, setRefundModalOpen] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<any>(null);
  const [selectedPlayerData, setSelectedPlayerData] = useState<any>(null);
  const [selectedPlayerPayments, setSelectedPlayerPayments] = useState<any[]>([]);
  const [viewPlayerId, setViewPlayerId] = useState<string | null>(null);

  const { data: payments, isLoading, refetch } = useQuery({
    queryKey: ["/api/payments", "records", selectedPlayer, selectedMonth],
    queryFn: async () => {
      // includeArchived: payments a renewal moved to history still belong to the month they were paid in
      const params = new URLSearchParams({ ...getMonthRange(selectedMonth), includeArchived: "true" });
      if (selectedPlayer !== "all") params.set("playerId", selectedPlayer);
      const response = await fetch(`/api/payments?${params}`);
      if (!response.ok) throw new Error('Failed to fetch payments');
      return response.json();
    },
    staleTime: 0,
    gcTime: 0,
  });

  const { data: players } = useQuery({
    queryKey: ["/api/players"],
  });

  const handleReceiptClick = async (payment: any) => {
    try {
      const response = await fetch(`/api/players/${payment.playerId}`);
      if (response.ok) {
        const playerData = await response.json();
        // The receipt lists the other payments of the same subscription period
        const paymentsResponse = await fetch(payment.archived
          ? `/api/payments/history/${payment.playerId}`
          : `/api/payments?playerId=${payment.playerId}`);
        let paymentsData = paymentsResponse.ok ? await paymentsResponse.json() : [];
        if (payment.archived) {
          paymentsData = paymentsData.filter((p: any) => p.subscriptionPeriodStart === payment.subscriptionPeriodStart);
        }

        setSelectedPayment(payment);
        setSelectedPlayerData(playerData);
        setSelectedPlayerPayments(paymentsData);
        setReceiptModalOpen(true);
      }
    } catch (error) {
      console.error('Failed to fetch player data:', error);
    }
  };

  const handleRefundClick = (payment: any) => {
    setSelectedPayment(payment);
    setRefundModalOpen(true);
  };

  // Force refetch when component mounts
  React.useEffect(() => {
    refetch();
  }, [refetch]);

  // Generate months for the last 12 months (from the 1st, so the 29th-31st don't skip a short month)
  const getMonthOptions = () => {
    const months = [];
    for (let i = 0; i < 12; i++) {
      const date = subMonths(startOfMonth(new Date()), i);
      months.push({
        value: format(date, 'yyyy-MM'),
        label: format(date, 'MMMM yyyy')
      });
    }
    return months;
  };

  // Archived payments (moved to history by a renewal) can't be refunded from here
  const canRefund = (payment: any) =>
    !payment.archived && payment.paymentStatus !== 'cancelled' && payment.paymentStatus !== 'refunded';

  const paymentList: any[] = (payments as any[]) || [];
  const monthTotal = paymentList.reduce((sum, p) => sum + parseFloat(p.amountPaid), 0);
  const monthLabel = format(parseISO(`${selectedMonth}-01`), 'MMMM yyyy');
  const formatAED = (amount: number) =>
    `AED ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const paymentCountLabel = `${paymentList.length} payment${paymentList.length === 1 ? '' : 's'}`;

  const archivedBadge = (
    <span
      className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600 align-middle"
      title="This payment belongs to a previous subscription period (the player has since renewed)"
    >
      Previous period
    </span>
  );

  const formatStatus = (status: string) =>
    status.replace('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase());

  if (isLoading) {
    return (
      <div className="lg:col-span-2">
        <Card className="animate-pulse">
          <CardContent className="p-6">
            <div className="h-64 bg-gray-200 rounded"></div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <>
      <div className="lg:col-span-2">
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3">
              <CardTitle>Payment Records</CardTitle>
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex items-center gap-2 flex-1">
                  <Filter className="h-4 w-4 text-gray-500 shrink-0" />
                  <Select value={selectedPlayer} onValueChange={setSelectedPlayer}>
                    <SelectTrigger className="flex-1 sm:w-48">
                      <SelectValue placeholder="Filter by player" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Players</SelectItem>
                      {(players as any)?.map((player: any) => (
                        <SelectItem key={player.id} value={player.id}>
                          {player.fullName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2 flex-1">
                  <Calendar className="h-4 w-4 text-gray-500 shrink-0" />
                  <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                    <SelectTrigger className="flex-1 sm:w-40">
                      <SelectValue placeholder="Select month" />
                    </SelectTrigger>
                    <SelectContent>
                      {getMonthOptions().map((month) => (
                        <SelectItem key={month.value} value={month.value}>
                          {month.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0 sm:p-6">
            {/* Mobile card list */}
            <div className="sm:hidden divide-y divide-gray-100">
              {paymentList.length === 0 && (
                <p className="text-center text-gray-400 py-8 text-sm px-4">No payments found.</p>
              )}
              {paymentList.map((payment: any) => {
                const method = PAYMENT_METHODS[payment.paymentMethod as keyof typeof PAYMENT_METHODS];
                const statusColor = PAYMENT_STATUS_COLORS[payment.paymentStatus] ?? "bg-gray-100 text-gray-800";
                const isRefundable = canRefund(payment);
                const isRefunded = payment.paymentStatus === 'refunded';
                return (
                  <div key={payment.id} className={`p-4 space-y-2 ${isRefunded ? 'opacity-75' : ''}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <button
                          className="text-sm font-semibold text-academy-blue hover:underline text-left truncate block max-w-full"
                          onClick={() => { setViewPlayerId(payment.playerId); setViewPlayerModalOpen(true); }}
                        >
                          {payment.playerName || payment.fullName || 'Unknown'}
                        </button>
                        <p className="text-xs text-gray-500 truncate">
                          {payment.description || 'Subscription payment'}
                          {payment.archived && archivedBadge}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className={`text-sm font-bold ${isRefunded ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                          AED {parseFloat(payment.amountPaid).toFixed(2)}
                        </p>
                        <p className="text-xs text-gray-400">{format(new Date(payment.paymentDate), 'MMM dd, yyyy')}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{method?.icon}</span>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${statusColor}`}>
                          {isRefunded && <span className="mr-1">↩</span>}
                          {formatStatus(payment.paymentStatus)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="link" className="text-academy-blue p-0 h-auto text-xs"
                          onClick={() => handleReceiptClick(payment)}>
                          <Receipt className="h-3.5 w-3.5 mr-1" />Receipt
                        </Button>
                        {isRefundable && (
                          <Button variant="link" className="text-purple-600 p-0 h-auto text-xs"
                            onClick={() => handleRefundClick(payment)}>
                            <RotateCcw className="h-3.5 w-3.5 mr-1" />Refund
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              {paymentList.length > 0 && (
                <div className="p-4 flex items-center justify-between bg-gray-50">
                  <span className="text-sm font-semibold text-gray-700">Total · {paymentCountLabel}</span>
                  <span className="text-sm font-bold text-green-700">{formatAED(monthTotal)}</span>
                </div>
              )}
            </div>

            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Player</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Method</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {paymentList.map((payment: any) => {
                    const method = PAYMENT_METHODS[payment.paymentMethod as keyof typeof PAYMENT_METHODS];
                    const statusColor = PAYMENT_STATUS_COLORS[payment.paymentStatus] ?? "bg-gray-100 text-gray-800";
                    const isRefundable = canRefund(payment);
                    const isRefunded = payment.paymentStatus === 'refunded';
                    const isPartiallyRefunded = payment.paymentStatus === 'partially_refunded';

                    return (
                      <tr key={payment.id} className={`hover:bg-gray-50 transition-colors ${isRefunded ? 'opacity-75' : ''}`}>
                        <td className="px-4 py-4 whitespace-nowrap">
                          <button
                            className="text-sm font-medium text-academy-blue hover:text-academy-blue-light hover:underline focus:outline-none text-left"
                            onClick={() => {
                              setViewPlayerId(payment.playerId);
                              setViewPlayerModalOpen(true);
                            }}
                          >
                            {payment.playerName || payment.fullName || 'Unknown Player'}
                          </button>
                          <div className="text-sm text-gray-500">
                            {payment.description || 'Subscription payment'}
                            {payment.archived && archivedBadge}
                          </div>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          <div className={`text-sm font-semibold ${isRefunded ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                            AED {parseFloat(payment.amountPaid).toFixed(2)}
                          </div>
                          <div className="text-xs text-gray-500">
                            Bal: AED {parseFloat(payment.remainingBalance).toFixed(2)}
                          </div>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          <div className="flex items-center space-x-1.5">
                            <span className="text-base">{method?.icon}</span>
                            <span className="text-sm text-gray-700">{method?.label}</span>
                          </div>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-700">
                          {format(new Date(payment.paymentDate), 'MMM dd, yyyy')}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${statusColor}`}>
                            {isRefunded && <span className="mr-1">↩</span>}
                            {isPartiallyRefunded && <span className="mr-1">↩</span>}
                            {formatStatus(payment.paymentStatus)}
                          </span>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm font-medium">
                          <div className="flex items-center gap-1">
                            <Button
                              variant="link"
                              className="text-academy-blue hover:text-academy-blue-light p-0 h-auto"
                              onClick={() => handleReceiptClick(payment)}
                            >
                              <Receipt className="h-3.5 w-3.5 mr-1" />
                              Receipt
                            </Button>

                            {isRefundable && (
                              <Button
                                variant="link"
                                className="text-purple-600 hover:text-purple-800 p-0 h-auto ml-2"
                                onClick={() => handleRefundClick(payment)}
                              >
                                <RotateCcw className="h-3.5 w-3.5 mr-1" />
                                Refund
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {paymentList.length > 0 && (
                  <tfoot className="bg-gray-50">
                    <tr>
                      <td className="px-4 py-3 text-sm font-semibold text-gray-700">
                        Total for {monthLabel} · {paymentCountLabel}
                      </td>
                      <td className="px-4 py-3 text-sm font-bold text-green-700 whitespace-nowrap" colSpan={5}>
                        {formatAED(monthTotal)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>

              {paymentList.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-gray-500">No payments found for the selected criteria</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Receipt Modal */}
      <ReceiptModal
        open={receiptModalOpen}
        onOpenChange={setReceiptModalOpen}
        player={selectedPlayerData}
        payment={selectedPayment}
        allPayments={selectedPlayerPayments}
      />

      {/* View Player Modal */}
      <ViewPlayerModal
        open={viewPlayerModalOpen}
        onOpenChange={setViewPlayerModalOpen}
        playerId={viewPlayerId}
      />

      {/* Refund Modal */}
      <RefundPaymentModal
        open={refundModalOpen}
        onOpenChange={setRefundModalOpen}
        payment={selectedPayment}
      />
    </>
  );
}