import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PAYMENT_METHODS } from "@/lib/constants";
import { getMonthRange } from "@/lib/utils";

interface PaymentSummary {
  totalCollected: string;
  totalRefunded: string;
  netCollected: string;
  paymentCount: number;
  byMethod: Record<string, number>;
}

interface PaymentOverviewProps {
  month: string; // 'YYYY-MM'
  playerId: string; // "all" or a player id
}

const formatAED = (amount: number) =>
  `AED ${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export default function PaymentOverview({ month, playerId }: PaymentOverviewProps) {
  // Totals for the month picked in Payment Records (includes payments archived by a renewal)
  const { data: summary, isLoading } = useQuery<PaymentSummary>({
    queryKey: ["/api/payments", "summary", month, playerId],
    queryFn: async () => {
      const params = new URLSearchParams(getMonthRange(month));
      if (playerId !== "all") params.set("playerId", playerId);
      const response = await fetch(`/api/payments/summary?${params}`);
      if (!response.ok) throw new Error('Failed to fetch payment summary');
      return response.json();
    },
  });

  // Outstanding balances are a snapshot of today, not of the selected month
  const { data: stats } = useQuery({
    queryKey: ["/api/dashboard/stats"],
  });

  if (isLoading) {
    return (
      <div className="lg:col-span-1 space-y-6">
        <Card className="animate-pulse">
          <CardContent className="p-6">
            <div className="h-32 bg-gray-200 rounded"></div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const monthLabel = format(parseISO(`${month}-01`), 'MMMM yyyy');
  const totalCollected = parseFloat(summary?.totalCollected || '0');
  const totalRefunded = parseFloat(summary?.totalRefunded || '0');
  const netCollected = parseFloat(summary?.netCollected || '0');
  const pendingPayments = parseFloat((stats as any)?.pendingPayments || '0');
  const overduePayments = parseFloat((stats as any)?.overduePayments || '0');

  const methodBreakdown: Record<string, number> = summary?.byMethod || {};

  const getMethodPercent = (key: string): string => {
    if (totalCollected <= 0) return '0%';
    const pct = ((methodBreakdown[key] || 0) / totalCollected) * 100;
    return `${pct.toFixed(1)}%`;
  };

  return (
    <div className="lg:col-span-1 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Payment Overview</CardTitle>
          <p className="text-sm text-gray-500">
            {monthLabel}{playerId !== "all" ? " · selected player" : ""}
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Total Collected</span>
              <span className="text-lg font-bold text-green-600">
                {formatAED(totalCollected)}
              </span>
            </div>
            {totalRefunded > 0 && (
              <>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Refunds</span>
                  <span className="text-lg font-bold text-purple-600">
                    − {formatAED(totalRefunded)}
                  </span>
                </div>
                <div className="flex justify-between items-center border-t pt-3">
                  <span className="text-sm text-gray-600">Net Collected</span>
                  <span className="text-lg font-bold text-gray-900">
                    {formatAED(netCollected)}
                  </span>
                </div>
              </>
            )}
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Payments</span>
              <span className="text-sm font-medium text-gray-900">{summary?.paymentCount ?? 0}</span>
            </div>
            {playerId === "all" && (
              <div className="border-t pt-4 space-y-4">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Outstanding today</p>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Pending Payments</span>
                  <span className="text-lg font-bold text-academy-red">
                    {formatAED(pendingPayments)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Overdue</span>
                  <span className="text-lg font-bold text-red-600">
                    {formatAED(overduePayments)}
                  </span>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payment Methods</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Object.entries(PAYMENT_METHODS).map(([key, method]) => (
              <div key={key} className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <span className="text-lg">{method.icon}</span>
                  <span className="text-sm">{method.label}</span>
                </div>
                <span className="text-sm font-medium">
                  {getMethodPercent(key)}
                  <span className="text-xs text-gray-500 font-normal ml-2">{formatAED(methodBreakdown[key] || 0)}</span>
                </span>
              </div>
            ))}
            {totalCollected === 0 && (
              <p className="text-xs text-gray-400 text-center pt-1">No payments in {monthLabel}</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
