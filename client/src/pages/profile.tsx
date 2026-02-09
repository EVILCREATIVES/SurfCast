import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ArrowLeft, User, Mail, Calendar, Waves } from "lucide-react";

export default function Profile() {
  const { user } = useAuth();
  const [, navigate] = useLocation();

  if (!user) return null;

  const initials = user.username.charAt(0).toUpperCase();

  return (
    <div className="flex flex-col h-screen w-full bg-background">
      <header className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
        <Button size="icon" variant="ghost" onClick={() => navigate("/")} data-testid="button-back-home">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <User className="w-5 h-5 text-primary shrink-0" />
        <h1 className="text-base font-bold">Profile</h1>
      </header>

      <div className="flex-1 overflow-auto p-4">
        <div className="max-w-md mx-auto space-y-4">
          <div className="flex flex-col items-center gap-3 py-6">
            <Avatar className="w-20 h-20">
              <AvatarFallback className="text-2xl bg-primary/10 text-primary">{initials}</AvatarFallback>
            </Avatar>
            <h2 className="text-lg font-bold" data-testid="text-profile-username">{user.username}</h2>
          </div>

          <Card className="p-4 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                <Mail className="w-4 h-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Email</p>
                <p className="text-sm font-medium" data-testid="text-profile-email">{user.username}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                <Calendar className="w-4 h-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Member Since</p>
                <p className="text-sm font-medium">February 2026</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                <Waves className="w-4 h-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Surf Level</p>
                <p className="text-sm font-medium">Intermediate</p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
