import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import {
  PROTECTED_AREA_LOCKED_EVENT,
  PROTECTED_AREA_STATUS_KEY,
  toProtectedAreaStatus,
  type ProtectedAreaStatus,
} from "@/lib/protected-area";

interface ProtectedAreaContextType {
  status: ProtectedAreaStatus | undefined;
  isUnlocked: boolean;
  isLoading: boolean;
  /** Opens the password dialog. */
  requestUnlock: () => void;
  lock: () => Promise<void>;
  /** Called by an unlock form once the server has accepted the password. */
  handleUnlocked: (status: ProtectedAreaStatus) => void;
  /** Inline password forms register while shown, so a locked response doesn't also open the dialog. */
  registerInlineForm: () => () => void;
  dialogOpen: boolean;
  setDialogOpen: (open: boolean) => void;
}

const ProtectedAreaContext = createContext<ProtectedAreaContextType | null>(null);

// The only cached queries that hold no protected data
const isAccessQuery = (key: readonly unknown[]) =>
  key[0] === "/api/user" || key[0] === PROTECTED_AREA_STATUS_KEY[0];

export function ProtectedAreaProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const inlineForms = useRef(0);
  const lastLockedAt = useRef(0);

  const { data: status, isLoading } = useQuery<ProtectedAreaStatus>({
    queryKey: PROTECTED_AREA_STATUS_KEY,
    queryFn: async () => toProtectedAreaStatus(await (await apiRequest("GET", "/api/protected-area")).json()),
    enabled: !!user,
  });

  // Drops everything loaded while unlocked; what is on screen is refetched without the protected data
  const lockLocally = useCallback(() => {
    const current = queryClient.getQueryData<ProtectedAreaStatus>(PROTECTED_AREA_STATUS_KEY);
    if (!current?.unlocked) return;
    lastLockedAt.current = Date.now();
    queryClient.setQueryData<ProtectedAreaStatus>(PROTECTED_AREA_STATUS_KEY, { ...current, unlocked: false, expiresAt: null });
    queryClient.resetQueries({ predicate: (query) => !isAccessQuery(query.queryKey) });
  }, []);

  // The server-side unlock runs out at expiresAt: lock the screen at the same moment
  useEffect(() => {
    if (!status?.unlocked || status.expiresAt === null) return;
    const delay = Math.min(Math.max(0, status.expiresAt - Date.now()), 2 ** 31 - 1);
    const timer = setTimeout(() => {
      lockLocally();
      queryClient.invalidateQueries({ queryKey: PROTECTED_AREA_STATUS_KEY });
    }, delay);
    return () => clearTimeout(timer);
  }, [status?.unlocked, status?.expiresAt, lockLocally]);

  // The server refused a request because the area is locked (it expired, or was locked in another tab)
  useEffect(() => {
    const onLocked = () => {
      // Refusals right after locking come from the lock's own refetch of what was on screen,
      // not from someone asking for protected data, so they don't open the dialog
      const causedByLocking = Date.now() - lastLockedAt.current < 5000;
      lockLocally();
      if (inlineForms.current === 0 && !causedByLocking) setDialogOpen(true);
    };
    window.addEventListener(PROTECTED_AREA_LOCKED_EVENT, onLocked);
    return () => window.removeEventListener(PROTECTED_AREA_LOCKED_EVENT, onLocked);
  }, [lockLocally]);

  const handleUnlocked = useCallback((next: ProtectedAreaStatus) => {
    queryClient.setQueryData(PROTECTED_AREA_STATUS_KEY, next);
    setDialogOpen(false);
    // Refetch what was loaded while locked so it now includes the protected data
    queryClient.invalidateQueries({ predicate: (query) => !isAccessQuery(query.queryKey) });
  }, []);

  const lock = useCallback(async () => {
    try {
      await apiRequest("POST", "/api/protected-area/lock");
      lockLocally();
      toast({ title: "Locked", description: "Employees, Expenses and Special Needs players need the password again." });
    } catch (error) {
      toast({ title: "Could not lock", description: (error as Error).message, variant: "destructive" });
    }
  }, [lockLocally, toast]);

  const registerInlineForm = useCallback(() => {
    inlineForms.current += 1;
    return () => {
      inlineForms.current -= 1;
    };
  }, []);

  const requestUnlock = useCallback(() => setDialogOpen(true), []);

  return (
    <ProtectedAreaContext.Provider
      value={{
        status,
        isUnlocked: !!status?.unlocked,
        isLoading: !!user && isLoading,
        requestUnlock,
        lock,
        handleUnlocked,
        registerInlineForm,
        dialogOpen,
        setDialogOpen,
      }}
    >
      {children}
    </ProtectedAreaContext.Provider>
  );
}

export function useProtectedArea() {
  const context = useContext(ProtectedAreaContext);
  if (!context) {
    throw new Error("useProtectedArea must be used within a ProtectedAreaProvider");
  }
  return context;
}

/**
 * Runs `onLock` when the protected area locks (expiry, "Lock" or a refused request). Queries are
 * cleared automatically; components use this to drop protected data they keep in their own state.
 */
export function useOnProtectedAreaLock(onLock: () => void) {
  const { isUnlocked } = useProtectedArea();
  const wasUnlocked = useRef(isUnlocked);
  const latestOnLock = useRef(onLock);
  latestOnLock.current = onLock;

  useEffect(() => {
    if (wasUnlocked.current && !isUnlocked) latestOnLock.current();
    wasUnlocked.current = isUnlocked;
  }, [isUnlocked]);
}
