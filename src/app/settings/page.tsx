import { SettingsForm } from "@/components/settings-form";
import { PinSettings } from "@/components/pin/pin-settings";
import { ExportPanel } from "@/components/export-panel";
import { ArchivedTasks } from "@/components/archived-tasks";
import { getUserPrefs } from "@/lib/services/prefs";
import { listTasks } from "@/lib/services/tasks";
import { defaultUserPrefs } from "@/lib/store/db";
import { DatabaseUnavailableError } from "@/lib/store/errors";
import type { UserPrefs, Task } from "@/lib/types";
import { auth } from "@clerk/nextjs/server";

export const metadata = {
  title: "Settings",
  description: "Manage your preferences, timezone, and data export.",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await auth.protect();

  // If the database is unreachable, still render the page with default values and
  // a clear notice, rather than crashing with a serialization error. Reads/writes
  // resume automatically once the DB is back.
  let prefs: UserPrefs;
  let archived: Task[] = [];
  let dbDown = false;
  try {
    const [loadedPrefs, allTasks] = await Promise.all([
      getUserPrefs(),
      listTasks(undefined, { includeArchived: true }),
    ]);
    prefs = loadedPrefs;
    archived = allTasks.filter((t) => !t.active);
  } catch (err) {
    if (!(err instanceof DatabaseUnavailableError)) throw err;
    prefs = defaultUserPrefs();
    dbDown = true;
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="space-y-4">
        {dbDown && (
          <div
            role="alert"
            className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger"
          >
            Couldn&rsquo;t reach the database, so your saved settings aren&rsquo;t
            shown and changes won&rsquo;t be saved. Try again in a moment.
          </div>
        )}
        <SettingsForm initial={prefs} />
        <PinSettings initialAutoLockMs={prefs.autoLockMs} />
        <ArchivedTasks initial={archived} />
        <ExportPanel />

        {/* Attribution required by the Flaticon free license for the app logo. */}
        <p className="px-1 pt-2 text-center text-xs text-muted">
          Logo:{" "}
          <a
            href="https://www.flaticon.es/iconos-gratis/puno"
            title="puño iconos"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-foreground"
          >
            Puño iconos creados por iconfield - Flaticon
          </a>
        </p>
      </div>
    </div>
  );
}
