import { Link, useLocation } from "wouter";
import { 
  BarChart3, 
  Users, 
  CreditCard, 
  CalendarCheck, 
  User,
  LogOut,
  GraduationCap,
  X,
  Wallet,
  Package,
  Lock
} from "lucide-react";
import { format } from "date-fns";
import { useAuth } from "@/hooks/use-auth";
import { useProtectedArea } from "@/hooks/use-protected-area";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: BarChart3 },
  { name: "Players", href: "/players", icon: Users },
  { name: "Payments", href: "/payments", icon: CreditCard },
  { name: "Sessions", href: "/sessions", icon: CalendarCheck },
  { name: "Employees", href: "/trainers", icon: GraduationCap, passwordProtected: true },
  { name: "Expenses", href: "/expenses", icon: Wallet, passwordProtected: true },
  { name: "Inventory", href: "/inventory", icon: Package },
];

interface SidebarProps {
  onClose?: () => void;
}

export default function Sidebar({ onClose }: SidebarProps) {
  const [location] = useLocation();
  const { user, logoutMutation } = useAuth();
  const { status: protectedArea, isUnlocked, lock } = useProtectedArea();

  return (
    <div className="w-64 h-full bg-white shadow-lg border-r border-gray-200 flex flex-col">
      {/* Logo Section */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <img 
              src="/e1-sport-logo.jpg" 
              alt="E1 Sport Champions Academy" 
              className="w-12 h-12 rounded-full object-cover"
            />
            <div>
              <h1 className="text-xl font-bold text-gray-900">E1 Sport</h1>
              <p className="text-sm text-academy-red font-medium">Champions Academy</p>
            </div>
          </div>
          {/* Close button — mobile only */}
          {onClose && (
            <button
              onClick={onClose}
              className="md:hidden p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
              aria-label="Close menu"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>

      {/* Navigation Menu */}
      <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
        {navigation.map((item) => {
          const isActive = location === item.href || (item.href === "/dashboard" && location === "/");
          const Icon = item.icon;

          return (
            <Link 
              key={item.name}
              href={item.href}
              onClick={onClose}
              className={`flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-colors ${
                isActive
                  ? "bg-blue-100 text-blue-700"
                  : "text-gray-700 hover:bg-gray-100"
              }`}
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span>{item.name}</span>
              {item.passwordProtected && !isUnlocked && (
                <Lock className="h-3.5 w-3.5 shrink-0 !ml-auto text-gray-400" aria-label="Password protected" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* User Profile */}
      <div className="p-4 border-t border-gray-200">
        <div className="flex items-center space-x-3 mb-4">
          <div className="w-8 h-8 bg-academy-blue rounded-full flex items-center justify-center shrink-0">
            <User className="h-4 w-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{user?.username || "Admin"}</p>
          </div>
          <ThemeToggle className="h-8 w-8" />
        </div>
        {isUnlocked && (
          <div className="mb-3">
            <Button
              variant="outline"
              className="w-full flex items-center justify-center space-x-2"
              onClick={() => lock()}
            >
              <Lock className="h-4 w-4" />
              <span>Lock protected pages</span>
            </Button>
            {protectedArea?.expiresAt && (
              <p className="mt-1.5 text-xs text-gray-500 text-center">
                Unlocked until {format(protectedArea.expiresAt, "h:mm a")}
              </p>
            )}
          </div>
        )}
        <Button
          variant="outline"
          className="w-full flex items-center justify-center space-x-2"
          onClick={() => logoutMutation.mutate()}
          disabled={logoutMutation.isPending}
        >
          <LogOut className="h-4 w-4" />
          <span>Logout</span>
        </Button>
      </div>
    </div>
  );
}