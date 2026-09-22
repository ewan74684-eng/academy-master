import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import {
  Users,
  CheckCircle,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Banknote,
  HandCoins,
  Clock,
  CalendarDays,
  RotateCcw,
  Package,
  PackageMinus,
  AlertTriangle as AlertTriangleIcon,
} from "lucide-react";

function fmt(val: string | undefined) {
  return `AED ${parseFloat(val || "0").toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface StatCardProps {
  title: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  valueColor?: string;
  tooltip?: string;
}

function StatCard({ title, value, sub, icon: Icon, iconBg, iconColor, valueColor, tooltip }: StatCardProps) {
  return (
    <Card className="glass hover-scale overflow-hidden relative border-none bg-white/80 shadow-sm" title={tooltip}>
      <div className={`absolute top-0 right-0 w-24 h-24 -mr-8 -mt-8 rounded-full ${iconBg} opacity-30 blur-2xl`} />
      <CardContent className="p-5 relative z-10">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider truncate">{title}</p>
            <p className={`text-xl font-extrabold mt-1 truncate ${valueColor ?? "text-gray-900"}`}>{value}</p>
            {sub && <p className="text-xs text-gray-400 mt-0.5 truncate">{sub}</p>}
          </div>
          <div className={`w-11 h-11 ${iconBg} rounded-xl flex items-center justify-center shadow-sm shrink-0`}>
            <Icon className={`${iconColor} h-5 w-5`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function StatsCards() {
  const { data: stats, isLoading } = useQuery({ queryKey: ["/api/dashboard/stats"] });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-4">
                <div className="h-16 bg-gray-200 rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const s = stats as any;

  const monthlyProfit = parseFloat(s?.monthlyProfit ?? "0");
  const annualProfit = parseFloat(s?.annualNetProfit ?? "0");

  return (
    <div className="space-y-4">

      {/* ── Row 1: Player Overview ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          title="Total Players"
          value={s?.totalPlayers ?? 0}
          icon={Users}
          iconBg="bg-blue-100"
          iconColor="text-blue-600"
        />
        <StatCard
          title="Active Subscriptions"
          value={s?.activeSubscriptions ?? 0}
          icon={CheckCircle}
          iconBg="bg-green-100"
          iconColor="text-green-600"
        />
        <StatCard
          title="Pending Payments"
          value={fmt(s?.pendingPayments)}
          sub="Unpaid player balances"
          icon={AlertTriangle}
          iconBg="bg-red-100"
          iconColor="text-red-600"
          valueColor="text-red-700"
        />
        <StatCard
          title="Outstanding Salaries"
          value={fmt(s?.outstandingSalaries)}
          sub="Net payable to employees"
          icon={Clock}
          iconBg="bg-indigo-100"
          iconColor="text-indigo-600"
          valueColor="text-indigo-700"
        />
      </div>

        {/* ── Row 2: Monthly Cash Flow ───────────────────────────────────── */}
      <div>
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">
          Monthly Cash Flow
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            title="Monthly Income"
            value={fmt(s?.monthlyIncome)}
            sub={`Gross ${fmt(s?.monthlyPlayerRevenue)} − Refunds ${fmt(s?.monthlyRefunds)}`}
            icon={TrendingUp}
            iconBg="bg-emerald-100"
            iconColor="text-emerald-600"
            valueColor="text-emerald-700"
            tooltip={`Player payments (gross): ${fmt(s?.monthlyPlayerRevenue)}\nAdvance repayments: ${fmt(s?.monthlyAdvanceRepayments)}\nRefunds issued: −${fmt(s?.monthlyRefunds)}\nNet income: ${fmt(s?.monthlyIncome)}`}
          />
          <StatCard
            title="Monthly Expenses"
            value={fmt(s?.monthlyExpenses)}
            sub={`Salaries/Adv · Academy Exp`}
            icon={TrendingDown}
            iconBg="bg-rose-100"
            iconColor="text-rose-600"
            valueColor="text-rose-700"
            tooltip={`Trainer cash payments: ${fmt(s?.monthlyTrainerCashPayments)}\nAdvances issued: ${fmt(s?.monthlyAdvancesCreated)}\nAcademy Expenses: ${fmt(s?.monthlyAcademyExpenses ?? (parseFloat(s?.monthlyExpenses || "0") - parseFloat(s?.monthlyTrainerCashPayments || "0") - parseFloat(s?.monthlyAdvancesCreated || "0")).toFixed(2))}`}
          />
          <StatCard
            title="Monthly Profit"
            value={fmt(s?.monthlyProfit)}
            sub="Net Income − Expenses"
            icon={Banknote}
            iconBg={monthlyProfit >= 0 ? "bg-teal-100" : "bg-orange-100"}
            iconColor={monthlyProfit >= 0 ? "text-teal-600" : "text-orange-600"}
            valueColor={monthlyProfit >= 0 ? "text-teal-700" : "text-orange-700"}
          />
          <StatCard
            title="Monthly Refunds"
            value={fmt(s?.monthlyRefunds)}
            sub="Cash returned to players"
            icon={RotateCcw}
            iconBg="bg-purple-100"
            iconColor="text-purple-600"
            valueColor="text-purple-700"
          />
        </div>
      </div>

      {/* ── Row 3: Annual Cash Flow ────────────────────────────────────── */}
      <div>
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">
          Annual Cash Flow ({new Date().getFullYear()})
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <StatCard
            title="Annual Income"
            value={fmt(s?.annualIncome)}
            sub="Player payments + repayments YTD"
            icon={TrendingUp}
            iconBg="bg-emerald-100"
            iconColor="text-emerald-600"
            valueColor="text-emerald-700"
          />
          <StatCard
            title="Annual Expenses"
            value={fmt(s?.annualExpenses)}
            sub="Salaries + advances + expenses YTD"
            icon={TrendingDown}
            iconBg="bg-rose-100"
            iconColor="text-rose-600"
            valueColor="text-rose-700"
          />
          <StatCard
            title="Annual Net Profit"
            value={fmt(s?.annualNetProfit)}
            sub="Income − Expenses YTD"
            icon={CalendarDays}
            iconBg={annualProfit >= 0 ? "bg-teal-100" : "bg-orange-100"}
            iconColor={annualProfit >= 0 ? "text-teal-600" : "text-orange-600"}
            valueColor={annualProfit >= 0 ? "text-teal-700" : "text-orange-700"}
          />
        </div>
      </div>

      {/* ── Row 4: Inventory Summary ────────────────────────────────────── */}
      <div>
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">
          Inventory Summary
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            title="Total Items"
            value={s?.inventoryTotalItems?.toString() || "0"}
            sub="Active items in inventory"
            icon={Package}
            iconBg="bg-blue-100"
            iconColor="text-blue-600"
          />
          <StatCard
            title="Out of Stock"
            value={s?.inventoryOutOfStock?.toString() || "0"}
            sub="Items with zero quantity"
            icon={PackageMinus}
            iconBg="bg-red-100"
            iconColor="text-red-600"
            valueColor={s?.inventoryOutOfStock > 0 ? "text-red-600" : "text-gray-900"}
          />
          <StatCard
            title="Low Stock"
            value={s?.inventoryLowStock?.toString() || "0"}
            sub="Items at or below min quantity"
            icon={AlertTriangleIcon}
            iconBg="bg-amber-100"
            iconColor="text-amber-600"
            valueColor={s?.inventoryLowStock > 0 ? "text-amber-600" : "text-gray-900"}
          />
          <StatCard
            title="Inventory Value"
            value={fmt(s?.inventoryTotalValue)}
            sub="Estimated current value"
            icon={Banknote}
            iconBg="bg-emerald-100"
            iconColor="text-emerald-600"
            valueColor="text-emerald-700"
          />
        </div>
      </div>

    </div>
  );
}
