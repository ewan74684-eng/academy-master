import { useState } from "react";
import { Plus } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import PaymentOverview from "@/components/payments/payment-overview";
import PaymentRecords from "@/components/payments/payment-records";
import AddPaymentModal from "@/components/modals/add-payment-modal";
import RenewPlayerModal from "@/components/modals/renew-player-modal";

export default function Payments() {
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [renewPlayerId, setRenewPlayerId] = useState<string | null>(null);
  // Shared by the overview and the records table so both show the same month and player
  const [selectedMonth, setSelectedMonth] = useState<string>(format(new Date(), 'yyyy-MM'));
  const [selectedPlayer, setSelectedPlayer] = useState<string>("all");

  return (
    <>
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200 px-4 sm:px-8 py-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 truncate">Payments</h2>
          <Button
            onClick={() => setShowAddPayment(true)}
            className="bg-academy-blue hover:bg-academy-blue-light text-white shrink-0"
          >
            <Plus className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Add Payment</span>
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-50 p-4 sm:p-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
          <PaymentOverview month={selectedMonth} playerId={selectedPlayer} />
          <PaymentRecords
            month={selectedMonth}
            onMonthChange={setSelectedMonth}
            playerId={selectedPlayer}
            onPlayerChange={setSelectedPlayer}
          />
        </div>
      </main>

      <AddPaymentModal
        open={showAddPayment}
        onOpenChange={setShowAddPayment}
        onRenewPlayer={setRenewPlayerId}
      />

      <RenewPlayerModal
        open={!!renewPlayerId}
        onOpenChange={(open) => { if (!open) setRenewPlayerId(null); }}
        playerId={renewPlayerId}
      />
    </>
  );
}
