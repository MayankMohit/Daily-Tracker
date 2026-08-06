import { SettingsForm } from "@/components/settings-form";
import { PinSettings } from "@/components/pin/pin-settings";
import { ExportPanel } from "@/components/export-panel";
import { ArchivedTasks } from "@/components/archived-tasks";
import { getUserPrefs } from "@/lib/services/prefs";
import { listTasks } from "@/lib/services/tasks";
import { auth } from "@clerk/nextjs/server";

export const metadata = {
  title: "Settings",
  description: "Manage your preferences, timezone, and data export.",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await auth.protect();

  const [prefs, allTasks] = await Promise.all([
    getUserPrefs(),
    listTasks(undefined, { includeArchived: true }),
  ]);
  const archived = allTasks.filter((t) => !t.active);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="space-y-4">
        <SettingsForm initial={prefs} />
        <PinSettings />
        <ArchivedTasks initial={archived} />
        <ExportPanel />
      </div>
    </div>
  );
}
