"use client";

import { useState, useEffect } from "react";
import { usePostHog } from "posthog-js/react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { CheckCircle2, AlertCircle, LogIn, Loader2, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { motion, AnimatePresence } from "framer-motion";

interface InterestModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listingTitle: string;
  listingId: string;
  isLoggedIn: boolean;
}

export function InterestModal({
  open,
  onOpenChange,
  listingTitle,
  listingId,
  isLoggedIn,
}: InterestModalProps) {
  const t = useTranslations();
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    message: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSending(true);

    try {
      const res = await fetch("/api/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId,
          message: formData.message,
          name: formData.name,
          phone: formData.phone,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 409) {
          setError(t("interest.alreadyResponded"));
        } else if (res.status === 400 && data.error?.includes("own listing")) {
          setError(t("interest.ownListing"));
        } else {
          setError(data.error || t("interest.errorGeneric"));
        }
        return;
      }

      setSubmitted(true);
      setTimeout(() => {
        onOpenChange(false);
        setSubmitted(false);
        setFormData({ name: "", email: "", phone: "", message: "" });
      }, 2500);
    } catch {
      setError(t("interest.errorGeneric"));
    } finally {
      setSending(false);
    }
  };

  const handleClose = (open: boolean) => {
    if (!sending) {
      onOpenChange(open);
      if (!open) {
        setError(null);
        setSubmitted(false);
      }
    }
  };

  if (!isLoggedIn) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md overflow-hidden">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col items-center py-8 text-center"
          >
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <LogIn className="h-8 w-8 text-primary" />
            </div>
            <DialogTitle className="text-xl">
              {t("interest.loginRequired")}
            </DialogTitle>
            <DialogDescription className="mt-2 max-w-xs">
              {t("interest.loginRequiredDesc")}
            </DialogDescription>
            <div className="mt-6 flex gap-3">
              <Button variant="outline" onClick={() => handleClose(false)}>
                {t("common.cancel")}
              </Button>
              <Button asChild className="gap-2">
                <Link href="/auth/login">
                  <LogIn className="h-4 w-4" />
                  {t("common.login")}
                </Link>
              </Button>
            </div>
          </motion.div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md overflow-hidden">
        <AnimatePresence mode="wait">
          {submitted ? (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.3, type: "spring", bounce: 0.4 }}
              className="flex flex-col items-center py-8 text-center"
            >
              <div className="relative mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.2, type: "spring", bounce: 0.5 }}
                >
                  <CheckCircle2 className="h-8 w-8 text-primary" />
                </motion.div>
              </div>
              <DialogTitle className="text-xl">
                {t("interest.messageSent")}
              </DialogTitle>
              <DialogDescription className="mt-2">
                {t("interest.messageSentDesc")}
              </DialogDescription>
            </motion.div>
          ) : (
            <motion.div
              key="form"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <DialogHeader>
                <DialogTitle>{t("interest.title")}</DialogTitle>
                <DialogDescription>
                  {t("interest.subtitle", { listing: listingTitle })}
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={handleSubmit} className="mt-4 space-y-4">
                <AnimatePresence>
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"
                    >
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      {error}
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="name">{t("interest.name")} *</Label>
                    <Input
                      id="name"
                      required
                      value={formData.name}
                      onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value })
                      }
                      placeholder={t("interest.yourName")}
                      disabled={sending}
                      className="bg-background/50 transition-colors focus:bg-background"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">{t("interest.phone")}</Label>
                    <Input
                      id="phone"
                      type="tel"
                      value={formData.phone}
                      onChange={(e) =>
                        setFormData({ ...formData, phone: e.target.value })
                      }
                      placeholder="+48 123 456 789"
                      disabled={sending}
                      className="bg-background/50 transition-colors focus:bg-background"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">{t("interest.email")}</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) =>
                      setFormData({ ...formData, email: e.target.value })
                    }
                    placeholder="you@example.com"
                    disabled={sending}
                    className="bg-background/50 transition-colors focus:bg-background"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="message">{t("interest.message")}</Label>
                  <Textarea
                    id="message"
                    rows={4}
                    value={formData.message}
                    onChange={(e) =>
                      setFormData({ ...formData, message: e.target.value })
                    }
                    placeholder={t("interest.messagePlaceholder")}
                    disabled={sending}
                    className="bg-background/50 transition-colors focus:bg-background resize-none"
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={() => handleClose(false)}
                    disabled={sending}
                  >
                    {t("common.cancel")}
                  </Button>
                  <Button type="submit" className="flex-1 gap-2" disabled={sending}>
                    {sending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    {sending
                      ? t("interest.sending")
                      : t("interest.sendMessage")}
                  </Button>
                </div>
              </form>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
