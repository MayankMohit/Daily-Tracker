import { PageHeader, EmptyState } from "@/components/ui";
import { PlannerClient } from "@/components/ai/planner-client";
import { auth } from "@clerk/nextjs/server";
import { aiConfigured, getCachedPlan } from "@/lib/services/ai";
import { todayKey } from "@/lib/date";

export const metadata = { title: "Day Planner" };
export const dynamic = "force-dynamic";

export default async function PlannerPage() {
  await auth.protect();

  const date = todayKey();

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

  const initialPlan = await getCachedPlan(date);

  return (
    <div>
      <PageHeader
        title="Day Planner"
        description="Today's tasks plus anything one-off, time-blocked into a schedule."
      />
      <PlannerClient date={date} initialPlan={initialPlan} />
    </div>
  );
}
