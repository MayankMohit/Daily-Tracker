import { SettingsForm } from "@/components/settings-form";
import { ExportPanel } from "@/components/export-panel";
import { getUserPrefs } from "@/lib/services/prefs";
import { auth } from "@clerk/nextjs/server";

export const metadata = {
  title: "Settings",
  description: "Manage your preferences, timezone, and data export.",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await auth.protect();

  const prefs = await getUserPrefs();
  return (
    <div className="mx-auto max-w-2xl">
      <div className="space-y-4">
        <SettingsForm initial={prefs} />
        <ExportPanel />
      </div>
    </div>
  );
}
