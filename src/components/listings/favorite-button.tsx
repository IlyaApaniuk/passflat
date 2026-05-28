"use client";

import { Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface FavoriteButtonProps {
  isFavorite: boolean;
  onToggle: () => void;
  size?: "sm" | "default";
  className?: string;
}

export function FavoriteButton({
  isFavorite,
  onToggle,
  size = "default",
  className,
}: FavoriteButtonProps) {
  const iconSize = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";

  return (
    <Button
      variant={isFavorite ? "default" : "outline"}
      size="icon"
      className={cn(
        "transition-transform hover:scale-105",
        size === "sm" && "h-8 w-8",
        className,
      )}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggle();
      }}
    >
      <Heart
        className={cn(
          iconSize,
          "transition-all",
          isFavorite ? "fill-red-500 text-red-500 scale-110" : "",
        )}
      />
    </Button>
  );
}
