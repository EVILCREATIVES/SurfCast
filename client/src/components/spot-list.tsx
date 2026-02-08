import { MapPin, Plus, Trash2, Navigation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { SurfSpot } from "@shared/schema";

interface SpotListProps {
  spots: SurfSpot[];
  selectedSpot: SurfSpot | null;
  isLoading: boolean;
  onSpotSelect: (spot: SurfSpot) => void;
  onDeleteSpot: (id: string) => void;
  onAddSpotClick: () => void;
}

const difficultyColors: Record<string, string> = {
  beginner: "text-green-400",
  intermediate: "text-yellow-400",
  advanced: "text-orange-400",
  expert: "text-red-400",
};

export function SpotList({ spots, selectedSpot, isLoading, onSpotSelect, onDeleteSpot, onAddSpotClick }: SpotListProps) {
  if (isLoading) {
    return (
      <div className="p-3 space-y-2">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-md" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 pt-3 pb-2 flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Surf Spots ({spots.length})
        </h3>
        <Button size="sm" variant="ghost" onClick={onAddSpotClick} data-testid="button-add-spot">
          <Plus className="w-4 h-4 mr-1" /> Add
        </Button>
      </div>

      <div className="flex-1 overflow-auto px-3 pb-3 space-y-1.5">
        {spots.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <MapPin className="w-10 h-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground/60">No spots saved yet</p>
            <p className="text-xs text-muted-foreground/40 mt-1">Click the map to add one</p>
          </div>
        )}

        {spots.map((spot) => {
          const isSelected = selectedSpot?.id === spot.id;
          return (
            <div
              key={spot.id}
              className={`group flex items-start gap-2.5 px-3 py-2.5 rounded-md cursor-pointer transition-colors ${
                isSelected ? "bg-primary/10 border border-primary/20" : "hover-elevate"
              }`}
              onClick={() => onSpotSelect(spot)}
              data-testid={`spot-item-${spot.id}`}
            >
              <MapPin className="w-4 h-4 mt-0.5 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-sm font-medium truncate">{spot.name}</span>
                  {spot.difficulty && (
                    <Badge variant="secondary" className={`text-xs ${difficultyColors[spot.difficulty] || ""}`}>
                      {spot.difficulty}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {spot.latitude.toFixed(3)}, {spot.longitude.toFixed(3)}
                </p>
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="opacity-0 group-hover:opacity-100 shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteSpot(spot.id);
                }}
                data-testid={`button-delete-spot-${spot.id}`}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
