import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { CostSubmitClient } from "./client";

interface PageProps {
  params: Promise<{ locale: string; city: string }>;
}

export default async function SubmitCostsPage({ params }: PageProps) {
  const { city: citySlug, locale } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/${locale}/auth/login?next=/${locale}/${citySlug}/costs/submit`);
  }

  return <CostSubmitClient citySlug={citySlug} />;
}
