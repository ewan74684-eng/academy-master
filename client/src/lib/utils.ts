import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { addMonths, format, isValid, parseISO } from "date-fns"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// 'YYYY-MM-DD' -> same day next month (Jan 31 -> Feb 28). Returns "" for an empty/invalid date.
export function addOneMonth(dateStr: string): string {
  const d = parseISO(dateStr)
  return dateStr && isValid(d) ? format(addMonths(d, 1), "yyyy-MM-dd") : ""
}
