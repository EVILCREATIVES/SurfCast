import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Waves, X } from "lucide-react";

interface LoginDialogProps {
  open: boolean;
  onClose: () => void;
  onDemoSuccess?: () => void;
}

export function LoginDialog({ open, onClose, onDemoSuccess }: LoginDialogProps) {
  const { login } = useAuth();
  const { toast } = useToast();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isDemoLoading, setIsDemoLoading] = useState(false);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await login(username, password);
      onClose();
    } catch {
      toast({ title: "Login failed", description: "Invalid email or password", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDemo = async () => {
    setIsDemoLoading(true);
    try {
      await login("1234@surfcast", "onlywater");
      onClose();
      if (onDemoSuccess) {
        onDemoSuccess();
      }
    } catch {
      toast({ title: "Demo login failed", description: "Please try again", variant: "destructive" });
    } finally {
      setIsDemoLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        data-testid="login-backdrop"
      />
      <Card className="relative z-10 w-full max-w-sm mx-4 p-6">
        <Button
          size="icon"
          variant="ghost"
          className="absolute top-2 right-2"
          onClick={onClose}
          data-testid="button-close-login"
        >
          <X className="w-4 h-4" />
        </Button>

        <div className="flex flex-col items-center gap-2 mb-6">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Waves className="w-6 h-6 text-primary" />
          </div>
          <h1 className="text-xl font-bold">SurfCast</h1>
          <p className="text-sm text-muted-foreground">Sign in to your account</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="login-username">Email</Label>
            <Input
              id="login-username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="you@email.com"
              data-testid="input-email"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="login-password">Password</Label>
            <Input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              data-testid="input-password"
            />
          </div>
          <Button type="submit" className="w-full" disabled={isLoading || isDemoLoading} data-testid="button-login">
            {isLoading ? "Signing in..." : "Sign In"}
          </Button>
        </form>

        <div className="relative my-4">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-card px-2 text-muted-foreground">or</span>
          </div>
        </div>

        <Button
          variant="outline"
          className="w-full"
          onClick={handleDemo}
          disabled={isLoading || isDemoLoading}
          data-testid="button-demo-login"
        >
          {isDemoLoading ? "Loading demo..." : "Try Demo Account"}
        </Button>
      </Card>
    </div>
  );
}
