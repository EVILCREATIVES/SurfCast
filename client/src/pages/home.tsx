import { useState, useCallback, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { SurfMap } from "@/components/surf-map";
import { ForecastPanel } from "@/components/forecast-panel";
import { SpotList } from "@/components/spot-list";
import { AddSpotDialog } from "@/components/add-spot-dialog";
import { SearchLocation } from "@/components/search-location";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Waves, ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import type { SurfSpot, ForecastResponse, InsertSurfSpot } from "@shared/schema";

export default function Home() {
  const { toast } = useToast();
  const [selectedSpot, setSelectedSpot] = useState<SurfSpot | null>(null);
  const [clickedLocation, setClickedLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [forecastLocation, setForecastLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationName, setLocationName] = useState<string>("");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
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
  }, []);

  const handleSpotSelect = useCallback((spot: SurfSpot) => {
    setSelectedSpot(spot);
    setClickedLocation(null);
    setForecastLocation({ lat: spot.latitude, lng: spot.longitude });
    setLocationName(spot.name);
    if (flyToRef.current) {
      flyToRef.current(spot.latitude, spot.longitude);
    }
  }, []);

  const handleSearchSelect = useCallback((lat: number, lng: number, name: string) => {
    setClickedLocation({ lat, lng });
    setForecastLocation({ lat, lng });
    setLocationName(name);
    setSelectedSpot(null);
    if (flyToRef.current) {
      flyToRef.current(lat, lng);
    }
  }, []);

  const handleAddSpotClick = useCallback(() => {
    setShowAddDialog(true);
  }, []);

  const handleSaveSpot = useCallback((data: InsertSurfSpot) => {
    addSpotMutation.mutate(data);
  }, [addSpotMutation]);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {/* Left Panel - Spots & Search */}
      <div
        className={`flex flex-col border-r border-border bg-sidebar transition-all duration-300 shrink-0 ${
          sidebarOpen ? "w-72" : "w-0"
        } overflow-hidden`}
      >
        <div className="flex items-center gap-2 px-3 pt-3 pb-2 border-b border-sidebar-border">
          <Waves className="w-5 h-5 text-primary shrink-0" />
          <h1 className="text-base font-bold tracking-tight truncate">SurfCast</h1>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </div>

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
      </div>

      {/* Map */}
      <div className="flex-1 relative min-w-0">
        <SurfMap
          spots={spots}
          selectedSpot={selectedSpot}
          clickedLocation={clickedLocation}
          onSpotSelect={handleSpotSelect}
          onMapClick={handleMapClick}
          onFlyTo={(fn) => { flyToRef.current = fn; }}
        />

        {/* Toggle sidebar button */}
        <Button
          size="icon"
          variant="secondary"
          className="absolute top-3 left-3 z-[1000]"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          data-testid="button-toggle-sidebar"
        >
          {sidebarOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </Button>

        {/* Save pin button - appears when a location is clicked */}
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
      </div>

      {/* Right Panel - Forecast */}
      <div className="w-80 shrink-0 border-l border-border bg-sidebar overflow-hidden hidden lg:flex flex-col">
        <ForecastPanel
          forecast={forecast || null}
          isLoading={forecastLoading}
          locationName={locationName}
        />
      </div>

      {/* Mobile forecast panel overlay */}
      {forecastLocation && (
        <div className="lg:hidden fixed inset-x-0 bottom-0 z-[1000] max-h-[60vh] bg-sidebar border-t border-border rounded-t-xl overflow-auto">
          <button
            className="w-full flex items-center justify-center py-2"
            onClick={() => { setForecastLocation(null); setClickedLocation(null); setSelectedSpot(null); setLocationName(""); }}
            data-testid="button-close-mobile-forecast"
          >
            <div className="w-10 h-1 bg-muted-foreground/30 rounded-full" />
          </button>
          <ForecastPanel
            forecast={forecast || null}
            isLoading={forecastLoading}
            locationName={locationName}
          />
        </div>
      )}

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
