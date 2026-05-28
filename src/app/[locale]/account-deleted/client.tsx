"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, RotateCcw, LogOut, Loader2 } from "lucide-react";

export function AccountDeletedClient() {
  const t = useTranslations("account.recovery");
  const router = useRouter();
  const [restoring, setRestoring] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const handleRestore = async () => {
    setRestoring(true);
    try {
      const res = await fetch("/api/account/recover", { method: "POST" });
      if (res.ok) {
        router.push("/dashboard");
        router.refresh();
      }
    } catch (error) {
      console.error("Failed to restore account:", error);
    }
    setRestoring(false);
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center py-12 text-center">
          <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
            <AlertTriangle className="h-8 w-8 text-amber-600 dark:text-amber-400" />
          </div>

          <h1 className="text-xl font-bold">{t("title")}</h1>
          <p className="mt-2 text-muted-foreground">{t("message")}</p>

          <div className="mt-8 flex w-full flex-col gap-3">
            <Button
              onClick={handleRestore}
              disabled={restoring || signingOut}
              className="gap-2"
            >
              {restoring ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4" />
              )}
              {t("restore")}
            </Button>
            <Button
              variant="outline"
              onClick={handleSignOut}
              disabled={restoring || signingOut}
              className="gap-2"
            >
              {signingOut ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <LogOut className="h-4 w-4" />
              )}
              {t("cancel")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
