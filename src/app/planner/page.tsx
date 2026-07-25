import { PageHeader, EmptyState } from "@/components/ui";
import { PlannerClient } from "@/components/ai/planner-client";
import { auth } from "@clerk/nextjs/server";
import { aiConfigured, getCachedPlan } from "@/lib/services/ai";
import { getUserPrefs } from "@/lib/services/prefs";
import { getEffectiveToday } from "@/lib/active-day";

export const metadata = {
  title: "Day Planner",
  description: "Plan your day with an AI-assisted schedule built from your tasks.",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function PlannerPage() {
  await auth.protect();

  const date = await getEffectiveToday();

  if (!aiConfigured) {
    return (
      <div>
        <PageHeader
          title="Day Planner"
          description="Ask the AI to time-block your day from your tasks and ad-hoc requirements."
        />
        <EmptyState
          title="The Day Planner needs a Gemini key"
          description="Add GEMINI_API_KEY to your environment to enable AI time-blocking."
        />
      </div>
    );
  }

  const [initialPlan, prefs] = await Promise.all([
    getCachedPlan(date),
    getUserPrefs(),
  ]);

  return (
    <PlannerClient
      date={date}
      initialPlan={initialPlan}
      initialWake={prefs.workingHours.wake}
      initialSleep={prefs.workingHours.sleep}
    />
  );
}
