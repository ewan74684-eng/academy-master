import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { generateReceipt } from "@/lib/pdf-generator";
import { printElementById } from "@/lib/print";
import type { Player, Payment } from "@shared/schema";
import { format } from "date-fns";
import { PAYMENT_METHODS, RECEIPT_NOTICE } from "@/lib/constants";
import { RotateCcw } from "lucide-react";

interface ReceiptModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  player?: Player;
  payment?: Payment;
  allPayments?: Payment[];
}

export default function ReceiptModal({ 
  open, 
  onOpenChange, 
  player, 
  payment,
  allPayments
}: ReceiptModalProps) {

  // Fetch refunds for this specific payment
  const { data: refundData } = useQuery({
    queryKey: ["/api/payments", (payment as any)?.id, "refunds"],
    queryFn: async () => {
      const res = await fetch(`/api/payments/${(payment as any).id}/refunds`);
      if (!res.ok) throw new Error("Failed to fetch refunds");
      return res.json();
    },
    enabled: open && !!(payment as any)?.id,
  });

  const refunds: any[] = refundData?.refunds ?? [];
  const totalRefunded = refunds.reduce((s, r) => s + parseFloat(r.refundAmount), 0);
  const netAmount = parseFloat((payment as any)?.amountPaid ?? "0") - totalRefunded;

  const handlePrint = () => {
    printElementById("receipt-content", {
      title: `Receipt ${(payment as any)?.receiptNumber ?? ""}`.trim(),
      styles: "body { max-width: 480px; margin: 0 auto; }",
    });
  };

  const handleDownloadPDF = () => {
    if (player && payment) {
      const pdf = generateReceipt(player, payment, allPayments);
      pdf.save(`receipt-${(payment as any).receiptNumber}.pdf`);
    }
  };

  if (!player || !payment) return null;

  const isRefunded = (payment as any).paymentStatus === 'refunded';
  const isPartiallyRefunded = (payment as any).paymentStatus === 'partially_refunded';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Payment Receipt</DialogTitle>
          <DialogDescription>
            Download or print payment receipt for {player.fullName}
          </DialogDescription>
        </DialogHeader>

        <div id="receipt-content" className="p-6">
          {/* Receipt Header */}
          <div className="text-center mb-6">
            <div className="flex items-center justify-center space-x-3 mb-2">
              <img 
                src="/e1-sport-logo.jpg" 
                alt="E1 Sport Champions Academy" 
                className="w-14 h-14 object-contain rounded-lg shadow-sm"
              />
              <div>
                <h2 className="text-xl font-bold text-gray-900">E1 Sport</h2>
                <p className="text-sm text-academy-red font-medium">Champions Academy</p>
              </div>
            </div>
            <p className="text-sm text-gray-600">Payment Receipt</p>

            {/* Refund status banner */}
            {isRefunded && (
              <div className="mt-3 px-3 py-2 bg-purple-50 border border-purple-200 rounded-lg flex items-center justify-center gap-2">
                <RotateCcw className="h-4 w-4 text-purple-600" />
                <span className="text-sm font-semibold text-purple-700">FULLY REFUNDED</span>
              </div>
            )}
            {isPartiallyRefunded && (
              <div className="mt-3 px-3 py-2 bg-indigo-50 border border-indigo-200 rounded-lg flex items-center justify-center gap-2">
                <RotateCcw className="h-4 w-4 text-indigo-600" />
                <span className="text-sm font-semibold text-indigo-700">PARTIALLY REFUNDED</span>
              </div>
            )}
          </div>

          {/* Receipt Details */}
          <div className="space-y-3 mb-6">
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Receipt #:</span>
              <span className="text-sm font-medium">{(payment as any).receiptNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Player:</span>
              <span className="text-sm font-medium">{player.fullName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Date:</span>
              <span className="text-sm font-medium">
                {new Date((payment as any).paymentDate).toLocaleDateString()}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Payment Method:</span>
              <span className="text-sm font-medium">
                {(payment as any).paymentMethod.charAt(0).toUpperCase() + (payment as any).paymentMethod.slice(1)}
              </span>
            </div>
          </div>

          {/* Payment Breakdown */}
          <div className="border-t border-gray-200 pt-4 space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Subscription Fee:</span>
              <span className="text-sm">AED {parseFloat((payment as any).subscriptionFee).toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Amount Paid:</span>
              <span className={`text-sm font-medium ${isRefunded ? 'line-through text-gray-400' : 'text-green-600'}`}>
                AED {parseFloat((payment as any).amountPaid).toFixed(2)}
              </span>
            </div>

            {/* Refund lines */}
            {totalRefunded > 0 && (
              <div className="flex justify-between text-purple-600">
                <span className="text-sm">Total Refunded:</span>
                <span className="text-sm font-medium">−AED {totalRefunded.toFixed(2)}</span>
              </div>
            )}

            {totalRefunded > 0 && (
              <div className="flex justify-between border-t border-gray-200 pt-2">
                <span className="text-sm font-semibold text-gray-900">Net Amount:</span>
                <span className={`text-sm font-bold ${netAmount <= 0 ? 'text-purple-600' : 'text-green-600'}`}>
                  AED {netAmount.toFixed(2)}
                </span>
              </div>
            )}

            <div className="flex justify-between border-t border-gray-200 pt-2">
              <span className="text-sm font-medium text-gray-900">Balance Remaining:</span>
              <span className="text-sm font-bold border-b border-gray-300 pb-1 text-green-600">
                AED {parseFloat((payment as any).remainingBalance).toFixed(2)}
              </span>
            </div>
          </div>

          {/* Refund Records Section */}
          {refunds.length > 0 && (
            <div className="mt-4 border-t border-purple-200 pt-4">
              <h3 className="text-sm font-bold text-purple-900 mb-2 flex items-center gap-1.5">
                <RotateCcw className="h-4 w-4 text-purple-600" />
                Refund Records ({refunds.length})
              </h3>
              <div className="space-y-2 max-h-[150px] overflow-y-auto pr-1">
                {refunds.map((r: any, i: number) => (
                  <div
                    key={r.id}
                    className="p-2 bg-purple-50 border border-purple-100 rounded-lg"
                  >
                    <div className="flex justify-between items-start">
                      <div className="min-w-0 flex-1">
                        <span className="text-xs font-semibold text-purple-700">Refund #{i + 1}</span>
                        <div className="text-xs text-gray-500">
                          {format(new Date(r.refundDate), 'MMM dd, yyyy')}
                          {' · '}
                          {PAYMENT_METHODS[r.refundMethod as keyof typeof PAYMENT_METHODS]?.label ?? r.refundMethod}
                        </div>
                        {r.reason && (
                          <div className="text-xs text-gray-600 mt-0.5 truncate">{r.reason}</div>
                        )}
                      </div>
                      <span className="text-sm font-bold text-purple-700 shrink-0 ml-2">
                        −AED {parseFloat(r.refundAmount).toFixed(2)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Payment History */}
          {allPayments && allPayments.length > 0 && (
            <div className="mt-4 border-t border-gray-200 pt-4">
              <h3 className="text-sm font-bold text-gray-900 mb-2">Payment History</h3>
              <div className="space-y-2 max-h-[150px] overflow-y-auto pr-2">
                {[...allPayments]
                  .sort((a, b) => new Date((b as any).paymentDate).getTime() - new Date((a as any).paymentDate).getTime())
                  .slice(0, 10)
                  .map((p: any) => (
                    <div key={p.id} className="flex justify-between text-xs items-center p-2 rounded bg-gray-50 border">
                      <div>
                        <span className="font-semibold">{new Date(p.paymentDate).toLocaleDateString()}</span>
                        <div className="text-gray-500">Receipt: {p.receiptNumber}</div>
                      </div>
                      <div className="text-right">
                        <span className={`font-bold ${
                          p.paymentStatus === 'refunded' ? 'text-purple-600 line-through' :
                          p.paymentStatus === 'partially_refunded' ? 'text-indigo-600' : 'text-green-600'
                        }`}>
                          AED {parseFloat(p.amountPaid).toFixed(2)}
                        </span>
                        <div className="text-gray-500">Method: {p.paymentMethod}</div>
                      </div>
                    </div>
                ))}
              </div>
            </div>
          )}

          {/* Terms notice — part of the printed customer copy */}
          <div className="mt-6 px-3 py-2 border border-gray-400 rounded-lg text-center">
            <p className="text-sm font-semibold text-gray-900">{RECEIPT_NOTICE}</p>
          </div>

          {/* Footer */}
          <div className="text-center mt-4 pt-4 border-t border-gray-200">
            <p className="text-xs text-gray-500">Thank you for choosing E1 Sport Champions Academy</p>
          </div>
        </div>

        <div className="flex space-x-4 p-6 border-t">
          <Button 
            className="flex-1 bg-academy-blue hover:bg-academy-blue-light text-white"
            onClick={handlePrint}
          >
            Print Receipt
          </Button>
          <Button 
            variant="outline" 
            className="flex-1"
            onClick={handleDownloadPDF}
          >
            Download PDF
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
