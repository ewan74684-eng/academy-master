import { Switch, Route } from "wouter";
import { ThemeProvider } from "next-themes";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import AppLayout from "@/components/layout/app-layout";
import Dashboard from "@/pages/dashboard";
import Players from "@/pages/players";
import Payments from "@/pages/payments";
import Sessions from "@/pages/sessions";
import Activities from "@/pages/activities";
import Reports from "@/pages/reports";
import Trainers from "@/pages/trainers";
import Expenses from "@/pages/expenses";
import Inventory from "@/pages/inventory";
import { AuthPage, ProtectedRoute } from "@/pages/auth-page";
import { AuthProvider } from "@/hooks/use-auth";
import { ProtectedAreaProvider } from "@/hooks/use-protected-area";
import { ProtectedAreaDialog } from "@/components/protected-area";

function Router() {
  return (
    <Switch>
      <Route path="/auth" component={AuthPage} />
      <ProtectedRoute path="/" component={Dashboard} />
      <ProtectedRoute path="/dashboard" component={Dashboard} />
      <ProtectedRoute path="/players" component={Players} />
      <ProtectedRoute path="/payments" component={Payments} />
      <ProtectedRoute path="/sessions" component={Sessions} />
      <ProtectedRoute path="/activities" component={Activities} />
      <ProtectedRoute path="/reports" component={Reports} />
      <ProtectedRoute path="/trainers" component={Trainers} passwordProtectedTitle="Employees" />
      <ProtectedRoute path="/expenses" component={Expenses} passwordProtectedTitle="Expenses" />
      <ProtectedRoute path="/inventory" component={Inventory} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} storageKey="e1-theme" disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ProtectedAreaProvider>
            <TooltipProvider>
              <Toaster />
              <ProtectedAreaDialog />
              <AppLayout>
                <Router />
              </AppLayout>
            </TooltipProvider>
          </ProtectedAreaProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
