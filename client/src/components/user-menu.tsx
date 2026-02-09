import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
      className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={() => navigate("/account")}
      data-testid="button-user-menu"
    >
      <Avatar className="w-8 h-8 cursor-pointer">
        <AvatarFallback className="text-xs bg-primary/10 text-primary">{initials}</AvatarFallback>
      </Avatar>
    </button>
  );
}
