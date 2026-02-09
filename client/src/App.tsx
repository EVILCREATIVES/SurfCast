import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider, useAuth } from "@/lib/auth";
import { LoginDialog } from "@/components/login-dialog";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import Sessions from "@/pages/sessions";
import Profile from "@/pages/profile";
import Settings from "@/pages/settings";
import AccountMenu from "@/pages/account-menu";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

function PageOverlay({ children }: { children: React.ReactNode }) {
  const [, navigate] = useLocation();

  return (
    <div className="fixed inset-0 z-[1500] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => navigate("/")}
        data-testid="overlay-backdrop"
      />
      <div className="relative z-10 w-full max-w-lg mx-4 max-h-[90vh] rounded-md overflow-hidden shadow-2xl border border-border">
        <Button
          size="icon"
          variant="ghost"
          className="absolute top-2 right-2 z-20"
          onClick={() => navigate("/")}
          data-testid="button-close-overlay"
        >
          <X className="w-4 h-4" />
        </Button>
        {children}
      </div>
    </div>
  );
}

function ProtectedOverlay({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading } = useAuth();
  const [, navigate] = useLocation();

  if (isLoading) return null;

  if (!user) {
    return (
      <LoginDialog
        open={true}
        onClose={() => navigate("/")}
      />
    );
  }

  return (
    <PageOverlay>
      <Component />
    </PageOverlay>
  );
}

function Router() {
  return (
    <>
      <Home />
      <Switch>
        <Route path="/">{() => null}</Route>
        <Route path="/account">{() => <ProtectedOverlay component={AccountMenu} />}</Route>
        <Route path="/profile">{() => <ProtectedOverlay component={Profile} />}</Route>
        <Route path="/sessions">{() => <ProtectedOverlay component={Sessions} />}</Route>
        <Route path="/settings">{() => <ProtectedOverlay component={Settings} />}</Route>
        <Route component={NotFound} />
      </Switch>
    </>
  );
}

function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AuthProvider>
            <Toaster />
            <Router />
          </AuthProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
