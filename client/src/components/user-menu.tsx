import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { LoginDialog } from "@/components/login-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { User, Activity, Settings, LogOut, LogIn } from "lucide-react";

export function UserMenu() {
  const { user, logout } = useAuth();
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
          onLoginSuccess={() => navigate("/profile")}
        />
      </>
    );
  }

  const initials = user.username.charAt(0).toUpperCase();

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild data-testid="button-user-menu">
        <button className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Avatar className="w-8 h-8 cursor-pointer">
            <AvatarFallback className="text-xs bg-primary/10 text-primary">{initials}</AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <div className="px-2 py-1.5">
          <p className="text-sm font-medium truncate">{user.username}</p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate("/profile")} data-testid="menu-item-profile">
          <User className="w-4 h-4 mr-2" />
          Profile
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => navigate("/sessions")} data-testid="menu-item-sessions">
          <Activity className="w-4 h-4 mr-2" />
          Your Sessions
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => navigate("/settings")} data-testid="menu-item-settings">
          <Settings className="w-4 h-4 mr-2" />
          Settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout} data-testid="menu-item-logout">
          <LogOut className="w-4 h-4 mr-2" />
          Log Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
