import { PageHeader } from "@/components/ui";
import { SettingsForm } from "@/components/settings-form";
import { ExportPanel } from "@/components/export-panel";
import { getUserPrefs } from "@/lib/services/prefs";
import { auth } from "@clerk/nextjs/server";

export const metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await auth.protect();

  const prefs = await getUserPrefs();
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Settings"
        description="Theme, timezone, AI behavior, and data export."
      />
      <div className="space-y-4">
        <SettingsForm initial={prefs} />
        <ExportPanel />
      </div>
    </div>
  );
}
