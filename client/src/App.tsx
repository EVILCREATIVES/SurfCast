import { useState } from "react";
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
import { Skeleton } from "@/components/ui/skeleton";

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading } = useAuth();
  const [, navigate] = useLocation();
  const [showLogin, setShowLogin] = useState(!isLoading && !user);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Skeleton className="w-12 h-12 rounded-full" />
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <Home />
        <LoginDialog
          open={showLogin}
          onClose={() => {
            setShowLogin(false);
            navigate("/");
          }}
        />
      </>
    );
  }

  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/sessions">{() => <ProtectedRoute component={Sessions} />}</Route>
      <Route path="/profile">{() => <ProtectedRoute component={Profile} />}</Route>
      <Route path="/settings">{() => <ProtectedRoute component={Settings} />}</Route>
      <Route component={NotFound} />
    </Switch>
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
