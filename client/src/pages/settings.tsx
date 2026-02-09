import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, X, Settings as SettingsIcon, Watch, Heart, Bike, Bluetooth } from "lucide-react";

interface DeviceConnection {
  name: string;
  icon: typeof Watch;
  description: string;
  status: "connected" | "disconnected";
  color: string;
}

const devices: DeviceConnection[] = [
  {
    name: "Apple Watch",
    icon: Watch,
    description: "Sync surf sessions from your Apple Watch",
    status: "disconnected",
    color: "text-rose-400",
  },
  {
    name: "Garmin",
    icon: Bluetooth,
    description: "Import activities from Garmin Connect",
    status: "disconnected",
    color: "text-blue-400",
  },
  {
    name: "Apple Health",
    icon: Heart,
    description: "Sync heart rate and workout data",
    status: "disconnected",
    color: "text-red-400",
  },
  {
    name: "Strava",
    icon: Bike,
    description: "Import and share surf activities",
    status: "disconnected",
    color: "text-orange-400",
  },
];

function DeviceRow({ device }: { device: DeviceConnection }) {
  const [status, setStatus] = useState(device.status);
  const isConnected = status === "connected";
  const Icon = device.icon;

  return (
    <div className="flex items-center gap-3 p-3" data-testid={`device-row-${device.name.toLowerCase().replace(/\s/g, "-")}`}>
      <div className={`w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0`}>
        <Icon className={`w-5 h-5 ${device.color}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium">{device.name}</p>
          {isConnected && <Badge variant="secondary" className="text-xs">Connected</Badge>}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{device.description}</p>
      </div>
      <Button
        variant={isConnected ? "outline" : "default"}
        size="sm"
        onClick={() => setStatus(isConnected ? "disconnected" : "connected")}
        data-testid={`button-connect-${device.name.toLowerCase().replace(/\s/g, "-")}`}
      >
        {isConnected ? "Disconnect" : "Connect"}
      </Button>
    </div>
  );
}

export default function Settings() {
  const [, navigate] = useLocation();

  return (
    <div className="flex flex-col w-full bg-background max-h-[90vh]">
      <header className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
        <Button size="icon" variant="ghost" onClick={() => navigate("/account")} data-testid="button-back-account">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <SettingsIcon className="w-5 h-5 text-primary shrink-0" />
        <h1 className="text-base font-bold flex-1">Settings</h1>
        <Button size="icon" variant="ghost" onClick={() => navigate("/")} data-testid="button-close-overlay">
          <X className="w-4 h-4" />
        </Button>
      </header>

      <div className="flex-1 overflow-auto p-4">
        <div className="max-w-md mx-auto space-y-6">
          <div>
            <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-2 px-1">Connected Devices</h2>
            <Card className="divide-y divide-border overflow-hidden">
              {devices.map((device) => (
                <DeviceRow key={device.name} device={device} />
              ))}
            </Card>
          </div>

          <div>
            <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-2 px-1">Data</h2>
            <Card className="divide-y divide-border overflow-hidden">
              <div className="flex items-center justify-between gap-2 p-3">
                <div>
                  <p className="text-sm font-medium">Import .FIT File</p>
                  <p className="text-xs text-muted-foreground">Upload Garmin .FIT activity files</p>
                </div>
                <Button variant="outline" size="sm" data-testid="button-import-fit">
                  Upload
                </Button>
              </div>
              <div className="flex items-center justify-between gap-2 p-3">
                <div>
                  <p className="text-sm font-medium">Export Sessions</p>
                  <p className="text-xs text-muted-foreground">Download all session data as JSON</p>
                </div>
                <Button variant="outline" size="sm" data-testid="button-export-sessions">
                  Export
                </Button>
              </div>
            </Card>
          </div>

          <div>
            <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-2 px-1">Preferences</h2>
            <Card className="divide-y divide-border overflow-hidden">
              <div className="flex items-center justify-between gap-2 p-3">
                <div>
                  <p className="text-sm font-medium">Units</p>
                  <p className="text-xs text-muted-foreground">Speed and distance units</p>
                </div>
                <Badge variant="secondary">Imperial (mph, mi)</Badge>
              </div>
              <div className="flex items-center justify-between gap-2 p-3">
                <div>
                  <p className="text-sm font-medium">Auto-Sync</p>
                  <p className="text-xs text-muted-foreground">Sync sessions when connected</p>
                </div>
                <Badge variant="secondary">Off</Badge>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
