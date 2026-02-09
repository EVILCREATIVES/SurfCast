import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { LoginDialog } from "@/components/login-dialog";
import { LogIn } from "lucide-react";

export function UserMenu() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [showLogin, setShowLogin] = useState(false);

  if (!user) {
    return (
      <>
        <Button
          variant="default"
          onClick={() => setShowLogin(true)}
          data-testid="button-sign-in"
        >
          <LogIn className="w-4 h-4 mr-2" />
          Sign In
        </Button>
        <LoginDialog
          open={showLogin}
          onClose={() => setShowLogin(false)}
          onLoginSuccess={() => navigate("/account")}
        />
      </>
    );
  }

  const initials = user.username.charAt(0).toUpperCase();

  return (
    <button
      className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring shadow-lg"
      onClick={() => navigate("/account")}
      data-testid="button-user-menu"
    >
      <Avatar className="w-10 h-10 cursor-pointer ring-2 ring-white/80 dark:ring-white/60">
        <AvatarFallback className="text-sm font-bold bg-primary text-primary-foreground">{initials}</AvatarFallback>
      </Avatar>
    </button>
  );
}
