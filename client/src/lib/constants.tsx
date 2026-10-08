import { ACTIVITY_DISPLAY } from "@shared/schema";

export const ACTIVITIES = ACTIVITY_DISPLAY;

// Terms printed on every customer subscription receipt (on-screen/printed copy and PDF)
export const RECEIPT_NOTICE = "Notice: No refunds. Memberships may be transferred, frozen, or switched.";

export const PAYMENT_METHODS = {
  cash: { icon: "💵", label: "Cash" },
  visa: { icon: "💳", label: "Visa" },
  bank_transfer: { icon: "🏦", label: "Bank Transfer" },
} as const;

export const SUBSCRIPTION_PLANS = {
  monthly: { label: "Monthly", price: 200, duration: 30 },
  quarterly: { label: "Quarterly", price: 550, duration: 90 },
  semi_annual: { label: "Semi-Annual", price: 1000, duration: 180 },
  annual: { label: "Annual", price: 1800, duration: 365 },
} as const;

export const PAYMENT_STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  completed: "bg-green-100 text-green-800",
  overdue: "bg-red-100 text-red-800",
  cancelled: "bg-gray-100 text-gray-800",
  refunded: "bg-purple-100 text-purple-800",
  partially_refunded: "bg-indigo-100 text-indigo-800",
};

export const SUBSCRIPTION_STATUS_COLORS = {
  active: "bg-green-100 text-green-800",
  paused: "bg-amber-100 text-amber-800",
  expired: "bg-red-100 text-red-800",
  renewal_due: "bg-orange-100 text-orange-800",
  cancelled: "bg-gray-100 text-gray-800",
} as const;
