"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Languages, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface TranslatedFields {
  title: string | null;
  description: string | null;
  roommateDescription: string | null;
  subletRules: string | null;
}

interface TranslateButtonProps {
  listingId: string;
  listingLocale: string | null;
  onTranslated: (fields: TranslatedFields) => void;
  onShowOriginal: () => void;
  isTranslated: boolean;
}

export function TranslateButton({
  listingId,
  listingLocale,
  onTranslated,
  onShowOriginal,
  isTranslated,
}: TranslateButtonProps) {
  const t = useTranslations();
  const currentLocale = useLocale();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  if (listingLocale === currentLocale) return null;

  const handleTranslate = async () => {
    setLoading(true);
    setError(false);

    try {
      const res = await fetch(`/api/listings/${listingId}/translate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetLocale: currentLocale }),
      });

      if (!res.ok) throw new Error("Translation failed");

      const data = await res.json();
      onTranslated(data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  if (isTranslated) {
    return (
      <button
        onClick={onShowOriginal}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <Languages className="h-3.5 w-3.5" />
        <span className="underline">{t("listings.detail.showOriginal")}</span>
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={handleTranslate}
        disabled={loading}
        className="gap-1.5"
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Languages className="h-3.5 w-3.5" />
        )}
        {loading ? t("listings.detail.translating") : t("listings.detail.translate")}
      </Button>
      {error && (
        <span className="text-xs text-destructive">
          {t("common.error")}
        </span>
      )}
    </div>
  );
}
