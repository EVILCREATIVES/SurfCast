import { useState, useCallback, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { SurfMap } from "@/components/surf-map";
import { ForecastPanel } from "@/components/forecast-panel";
import { SpotList } from "@/components/spot-list";
import { AddSpotDialog } from "@/components/add-spot-dialog";
import { SearchLocation } from "@/components/search-location";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { SurfChat } from "@/components/surf-chat";
import { UserMenu } from "@/components/user-menu";
import { Waves, ChevronLeft, ChevronRight, MapPin, List, X } from "lucide-react";
import type { SurfSpot, ForecastResponse, InsertSurfSpot } from "@shared/schema";

export default function Home() {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [, navigate] = useLocation();
  const [selectedSpot, setSelectedSpot] = useState<SurfSpot | null>(null);
  const [clickedLocation, setClickedLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [forecastLocation, setForecastLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationName, setLocationName] = useState<string>("");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mobileForecastExpanded, setMobileForecastExpanded] = useState(false);
  const flyToRef = useRef<((lat: number, lng: number) => void) | null>(null);

  const { data: spots = [], isLoading: spotsLoading } = useQuery<SurfSpot[]>({
    queryKey: ["/api/spots"],
  });

  const { data: forecast, isLoading: forecastLoading } = useQuery<ForecastResponse>({
    queryKey: ["/api/forecast", forecastLocation?.lat, forecastLocation?.lng],
    enabled: !!forecastLocation,
  });

  const addSpotMutation = useMutation({
    mutationFn: async (data: InsertSurfSpot) => {
      const res = await apiRequest("POST", "/api/spots", data);
      return res.json();
    },
    onSuccess: (newSpot: SurfSpot) => {
      queryClient.invalidateQueries({ queryKey: ["/api/spots"] });
      setShowAddDialog(false);
      setSelectedSpot(newSpot);
      setForecastLocation({ lat: newSpot.latitude, lng: newSpot.longitude });
      setLocationName(newSpot.name);
      toast({ title: "Spot saved", description: `${newSpot.name} has been added to your spots.` });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save spot.", variant: "destructive" });
    },
  });

  const deleteSpotMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/spots/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/spots"] });
      if (selectedSpot) {
        setSelectedSpot(null);
      }
      toast({ title: "Spot removed" });
    },
  });

  const handleMapClick = useCallback((lat: number, lng: number) => {
    setClickedLocation({ lat, lng });
    setForecastLocation({ lat, lng });
    setLocationName(`${lat.toFixed(3)}, ${lng.toFixed(3)}`);
    setSelectedSpot(null);
    if (isMobile) {
      setMobileForecastExpanded(true);
    }
  }, [isMobile]);

  const handleSpotSelect = useCallback((spot: SurfSpot) => {
    setSelectedSpot(spot);
    setClickedLocation(null);
    setForecastLocation({ lat: spot.latitude, lng: spot.longitude });
    setLocationName(spot.name);
    if (flyToRef.current) {
      flyToRef.current(spot.latitude, spot.longitude);
    }
    if (isMobile) {
      setSidebarOpen(false);
      setMobileForecastExpanded(true);
    }
  }, [isMobile]);

  const handleSearchSelect = useCallback((lat: number, lng: number, name: string) => {
    setClickedLocation({ lat, lng });
    setForecastLocation({ lat, lng });
    setLocationName(name);
    setSelectedSpot(null);
    if (flyToRef.current) {
      flyToRef.current(lat, lng);
    }
    if (isMobile) {
      setSidebarOpen(false);
      setMobileForecastExpanded(true);
    }
  }, [isMobile]);

  const handleAddSpotClick = useCallback(() => {
    setShowAddDialog(true);
  }, []);

  const handleSaveSpot = useCallback((data: InsertSurfSpot) => {
    addSpotMutation.mutate(data);
  }, [addSpotMutation]);

  const sidebarContent = (
    <>
      <div className="px-3 py-2">
        <SearchLocation onLocationSelect={handleSearchSelect} />
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        <SpotList
          spots={spots}
          selectedSpot={selectedSpot}
          isLoading={spotsLoading}
          onSpotSelect={handleSpotSelect}
          onDeleteSpot={(id) => deleteSpotMutation.mutate(id)}
          onAddSpotClick={handleAddSpotClick}
        />
      </div>
    </>
  );

  if (isMobile) {
    return (
      <div className="flex flex-col h-screen w-full overflow-hidden bg-background">
        <div className="flex-1 relative min-h-0">
          <SurfMap
            spots={spots}
            selectedSpot={selectedSpot}
            clickedLocation={clickedLocation}
            onSpotSelect={handleSpotSelect}
            onMapClick={handleMapClick}
            onFlyTo={(fn) => { flyToRef.current = fn; }}
          />

          <div className="absolute top-3 left-3 z-[1000] flex items-center gap-2">
            <Button
              size="icon"
              variant="secondary"
              onClick={() => setSidebarOpen(true)}
              data-testid="button-toggle-sidebar"
            >
              <List className="w-4 h-4" />
            </Button>
            <div className="flex items-center gap-1.5 bg-background/80 backdrop-blur-sm rounded-md px-2 py-1">
              <Waves className="w-4 h-4 text-primary" />
              <span className="text-sm font-bold">SurfCast</span>
            </div>
          </div>

          <div className="absolute top-3 right-3 z-[1001]">
            <UserMenu />
          </div>

          {clickedLocation && (
            <Button
              variant="default"
              className="absolute bottom-3 left-1/2 -translate-x-1/2 z-[1000]"
              onClick={() => setShowAddDialog(true)}
              data-testid="button-save-pin"
            >
              <MapPin className="w-4 h-4 mr-1.5" />
              Save This Spot
            </Button>
          )}
        </div>

        {forecastLocation && (
          <div
            className={`bg-sidebar border-t border-border transition-all duration-300 ${
              mobileForecastExpanded ? "max-h-[55vh]" : "max-h-14"
            } overflow-hidden flex flex-col shrink-0`}
          >
            <button
              className="w-full flex items-center justify-between px-3 py-2.5 shrink-0"
              onClick={() => setMobileForecastExpanded(!mobileForecastExpanded)}
              data-testid="button-toggle-mobile-forecast"
            >
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-8 h-1 bg-muted-foreground/30 rounded-full shrink-0" />
                <span className="text-sm font-medium truncate">{locationName || "Forecast"}</span>
              </div>
              <Button
                size="icon"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  setForecastLocation(null);
                  setClickedLocation(null);
                  setSelectedSpot(null);
                  setLocationName("");
                  setMobileForecastExpanded(false);
                }}
                data-testid="button-close-mobile-forecast"
              >
                <X className="w-4 h-4" />
              </Button>
            </button>
            <div className="flex-1 min-h-0 overflow-auto">
              <ForecastPanel
                forecast={forecast || null}
                isLoading={forecastLoading}
                locationName={locationName}
              />
            </div>
          </div>
        )}

        <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
          <SheetContent side="left" className="w-[85vw] max-w-xs p-0 flex flex-col">
            <SheetHeader className="px-3 pt-3 pb-2 border-b border-sidebar-border shrink-0">
              <div className="flex items-center gap-2">
                <Waves className="w-5 h-5 text-primary shrink-0" />
                <SheetTitle className="text-base font-bold tracking-tight">SurfCast</SheetTitle>
                <div className="ml-auto flex items-center gap-1">
                  <ThemeToggle />
                </div>
              </div>
            </SheetHeader>
            {sidebarContent}
          </SheetContent>
        </Sheet>

        <SurfChat latitude={forecastLocation?.lat} longitude={forecastLocation?.lng} isMobile={true} hasForecastPanel={!!forecastLocation} />

        <AddSpotDialog
          open={showAddDialog}
          onClose={() => setShowAddDialog(false)}
          onSubmit={handleSaveSpot}
          initialLat={clickedLocation?.lat || forecastLocation?.lat}
          initialLng={clickedLocation?.lng || forecastLocation?.lng}
          isPending={addSpotMutation.isPending}
        />
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <div
        className={`flex flex-col border-r border-border bg-sidebar transition-all duration-300 shrink-0 ${
          sidebarOpen ? "w-72" : "w-0"
        } overflow-hidden`}
      >
        <div className="flex items-center gap-2 px-3 pt-3 pb-2 border-b border-sidebar-border">
          <Waves className="w-5 h-5 text-primary shrink-0" />
          <h1 className="text-base font-bold tracking-tight truncate">SurfCast</h1>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
          </div>
        </div>
        {sidebarContent}
      </div>

      <div className="flex-1 relative min-w-0">
        <SurfMap
          spots={spots}
          selectedSpot={selectedSpot}
          clickedLocation={clickedLocation}
          onSpotSelect={handleSpotSelect}
          onMapClick={handleMapClick}
          onFlyTo={(fn) => { flyToRef.current = fn; }}
        />

        <div className="absolute top-3 left-3 z-[1000]">
          <Button
            size="icon"
            variant="secondary"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            data-testid="button-toggle-sidebar"
          >
            {sidebarOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </Button>
        </div>

        <div className="absolute top-3 right-3 z-[1001]">
          <UserMenu />
        </div>

        {clickedLocation && (
          <Button
            variant="default"
            className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[1000]"
            onClick={() => setShowAddDialog(true)}
            data-testid="button-save-pin"
          >
            <MapPin className="w-4 h-4 mr-1.5" />
            Save This Spot
          </Button>
        )}

        {forecastLocation && (
          <div className="absolute top-14 right-3 z-[1000] w-80 max-h-[calc(100vh-68px)] bg-sidebar/95 backdrop-blur-sm border border-border rounded-md overflow-hidden flex flex-col shadow-lg">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
              <span className="text-sm font-medium truncate">{locationName || "Forecast"}</span>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => {
                  setForecastLocation(null);
                  setClickedLocation(null);
                  setSelectedSpot(null);
                  setLocationName("");
                }}
                data-testid="button-close-forecast"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex-1 min-h-0 overflow-auto">
              <ForecastPanel
                forecast={forecast || null}
                isLoading={forecastLoading}
                locationName={locationName}
              />
            </div>
          </div>
        )}
      </div>

      <SurfChat latitude={forecastLocation?.lat} longitude={forecastLocation?.lng} isMobile={false} hasForecastPanel={false} />

      <AddSpotDialog
        open={showAddDialog}
        onClose={() => setShowAddDialog(false)}
        onSubmit={handleSaveSpot}
        initialLat={clickedLocation?.lat || forecastLocation?.lat}
        initialLng={clickedLocation?.lng || forecastLocation?.lng}
        isPending={addSpotMutation.isPending}
      />
    </div>
  );
}
