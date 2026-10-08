import { ReactNode, useEffect, useId, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AlertCircle, Loader2, Lock, Unlock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useProtectedArea } from "@/hooks/use-protected-area";
import { apiRequest } from "@/lib/queryClient";
import { toProtectedAreaStatus } from "@/lib/protected-area";

/** Password form that unlocks Employees, Expenses and Special Needs players. */
export function UnlockForm({ inline = false }: { inline?: boolean }) {
  const { status, handleUnlocked, registerInlineForm } = useProtectedArea();
  const [password, setPassword] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();

  useEffect(() => (inline ? registerInlineForm() : undefined), [inline, registerInlineForm]);

  const unlockMutation = useMutation({
    mutationFn: async (value: string) => {
      const res = await apiRequest("POST", "/api/protected-area/unlock", { password: value });
      return toProtectedAreaStatus(await res.json());
    },
    onSuccess: (next) => {
      setPassword("");
      handleUnlocked(next);
    },
    onError: () => {
      setPassword("");
      inputRef.current?.focus();
    },
  });

  const minutes = status?.timeoutMinutes ?? 15;

  if (status && !status.configured) {
    return (
      <p className="text-sm text-gray-600 text-center">
        No password has been set up for the protected pages yet. Ask the administrator to set
        PROTECTED_AREA_PASSWORD on the server.
      </p>
    );
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (password) unlockMutation.mutate(password);
      }}
    >
      <div className="space-y-2">
        <Label htmlFor={inputId}>Password</Label>
        <Input
          id={inputId}
          ref={inputRef}
          type="password"
          autoComplete="off"
          autoFocus
          placeholder="Enter the password"
          value={password}
          aria-invalid={unlockMutation.isError}
          onChange={(e) => {
            setPassword(e.target.value);
            if (unlockMutation.isError) unlockMutation.reset();
          }}
        />
      </div>
      {unlockMutation.isError && (
        <p role="alert" className="flex items-center gap-1.5 text-sm font-medium text-red-600">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {unlockMutation.error.message}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={!password || unlockMutation.isPending}>
        {unlockMutation.isPending ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Unlock className="mr-2 h-4 w-4" />
        )}
        Unlock
      </Button>
      <p className="text-xs text-gray-500 text-center">
        Stays unlocked for {minutes} minute{minutes === 1 ? "" : "s"}, or until you lock it or log out.
      </p>
    </form>
  );
}

function LockedHeading({ title, description }: { title: string; description: string }) {
  return (
    <div className="text-center mb-6">
      <div className="mx-auto mb-3 w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
        <Lock className="h-6 w-6 text-academy-blue" />
      </div>
      <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
      <p className="text-sm text-gray-500 mt-1">{description}</p>
    </div>
  );
}

/** Asks for the password when a protected request is refused outside a page that has its own form. */
export function ProtectedAreaDialog() {
  const { dialogOpen, setDialogOpen } = useProtectedArea();
  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-academy-blue" />
            Password required
          </DialogTitle>
          <DialogDescription>
            Employees, Expenses and Special Needs players are password protected. Enter the password to continue.
          </DialogDescription>
        </DialogHeader>
        {dialogOpen && <UnlockForm />}
      </DialogContent>
    </Dialog>
  );
}

/** Renders a protected page only once the password has been entered. */
export function ProtectedPage({ title, children }: { title: string; children: ReactNode }) {
  const { isUnlocked, isLoading } = useProtectedArea();

  if (isUnlocked) return <>{children}</>;

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-border" />
      </div>
    );
  }

  return (
    <>
      <header className="bg-white shadow-sm border-b border-gray-200 px-4 sm:px-8 py-4">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900 truncate">{title}</h2>
      </header>
      <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-50 p-4 sm:p-8">
        <div className="max-w-md mx-auto mt-4 sm:mt-16 bg-white rounded-lg shadow-sm border border-gray-200 p-6 sm:p-8">
          <LockedHeading
            title={`${title} is password protected`}
            description="Enter the password to open this page."
          />
          <UnlockForm inline />
        </div>
      </main>
    </>
  );
}

/** Shown in place of a list when the Special Needs activity is selected while locked. */
export function LockedSpecialNeedsPanel() {
  return (
    <div className="px-4 py-10 sm:py-14">
      <div className="max-w-sm mx-auto">
        <LockedHeading
          title="Special Needs players are password protected"
          description="Enter the password to view these players and their details."
        />
        <UnlockForm inline />
      </div>
    </div>
  );
}

/** One-line note that some rows are hidden until the password is entered. */
export function HiddenProtectedNotice({ message }: { message: string }) {
  const { requestUnlock } = useProtectedArea();
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-6 py-2.5 border-b border-gray-200 bg-gray-50 text-sm text-gray-600">
      <span className="flex items-center gap-2">
        <Lock className="h-4 w-4 shrink-0 text-amber-600" />
        {message}
      </span>
      <Button variant="link" className="h-auto p-0 text-academy-blue" onClick={requestUnlock}>
        Unlock
      </Button>
    </div>
  );
}
