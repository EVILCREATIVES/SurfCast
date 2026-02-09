import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { User, Activity, Settings, LogOut, ChevronRight, X } from "lucide-react";

interface MenuItem {
  label: string;
  description: string;
  icon: typeof User;
  path: string;
  testId: string;
}

const menuItems: MenuItem[] = [
  {
    label: "Profile",
    description: "View your account details",
    icon: User,
    path: "/profile",
    testId: "menu-link-profile",
  },
  {
    label: "Your Sessions",
    description: "View your surf session history",
    icon: Activity,
    path: "/sessions",
    testId: "menu-link-sessions",
  },
  {
    label: "Settings",
    description: "Connect Apple Watch, Garmin, Strava & more",
    icon: Settings,
    path: "/settings",
    testId: "menu-link-settings",
  },
];

export default function AccountMenu() {
  const { user, logout } = useAuth();
  const [, navigate] = useLocation();

  if (!user) return null;

  const initials = user.username.charAt(0).toUpperCase();

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  return (
    <div className="flex flex-col w-full bg-background">
      <div className="flex justify-end px-4 pt-3">
        <Button size="icon" variant="ghost" onClick={() => navigate("/")} data-testid="button-close-overlay">
          <X className="w-4 h-4" />
        </Button>
      </div>
      <div className="flex flex-col items-center gap-2 pb-4 px-4">
        <Avatar className="w-16 h-16">
          <AvatarFallback className="text-xl bg-primary/10 text-primary">{initials}</AvatarFallback>
        </Avatar>
        <p className="text-base font-bold" data-testid="text-account-username">{user.username}</p>
      </div>

      <div className="px-4 pb-4">
        <Card className="divide-y divide-border overflow-hidden">
          {menuItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.path}
                className="w-full flex items-center gap-3 p-3 text-left hover-elevate"
                onClick={() => navigate(item.path)}
                data-testid={item.testId}
              >
                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{item.label}</p>
                  <p className="text-xs text-muted-foreground">{item.description}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </button>
            );
          })}
        </Card>
      </div>

      <div className="px-4 pb-6">
        <Card className="overflow-hidden">
          <button
            className="w-full flex items-center gap-3 p-3 text-left hover-elevate"
            onClick={handleLogout}
            data-testid="menu-link-logout"
          >
            <div className="w-9 h-9 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
              <LogOut className="w-4 h-4 text-destructive" />
            </div>
            <p className="text-sm font-medium text-destructive">Log Out</p>
          </button>
        </Card>
      </div>
    </div>
  );
}
