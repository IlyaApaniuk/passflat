"use client";

import { useState, useEffect, useCallback, useRef } from "react";

const LS_KEY = "passflat_favorites";

function readLocalFavorites(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || "[]");
  } catch {
    return [];
  }
}

function writeLocalFavorites(ids: string[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(ids));
  } catch {
    // storage full or unavailable
  }
}

export function useFavorites(isLoggedIn: boolean) {
  const [favorites, setFavorites] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const synced = useRef(false);

  useEffect(() => {
    if (isLoggedIn) {
      fetch("/api/favorites")
        .then((r) => (r.ok ? r.json() : []))
        .then((ids: string[]) => {
          setFavorites(ids);
          setLoading(false);

          if (!synced.current) {
            synced.current = true;
            const local = readLocalFavorites();
            if (local.length > 0) {
              const toSync = local.filter((id) => !ids.includes(id));
              if (toSync.length > 0) {
                fetch("/api/favorites/sync", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ listingIds: toSync }),
                }).then(() => {
                  setFavorites((prev) => [...new Set([...prev, ...toSync])]);
                });
              }
              writeLocalFavorites([]);
            }
          }
        })
        .catch(() => setLoading(false));
    } else {
      setFavorites(readLocalFavorites());
      setLoading(false);
    }
  }, [isLoggedIn]);

  const isFavorite = useCallback(
    (listingId: string) => favorites.includes(listingId),
    [favorites],
  );

  const toggleFavorite = useCallback(
    async (listingId: string) => {
      const wasFav = favorites.includes(listingId);
      const next = wasFav
        ? favorites.filter((id) => id !== listingId)
        : [...favorites, listingId];

      setFavorites(next);

      if (!isLoggedIn) {
        writeLocalFavorites(next);
        return;
      }

      try {
        const res = await fetch("/api/favorites", {
          method: wasFav ? "DELETE" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ listingId }),
        });
        if (!res.ok) throw new Error();
      } catch {
        setFavorites(favorites);
      }
    },
    [favorites, isLoggedIn],
  );

  return { favorites, isFavorite, toggleFavorite, loading };
}
