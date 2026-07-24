import { PageHeader } from "@/components/ui";
import { MoodStrip } from "@/components/mood-strip";
import { auth } from "@clerk/nextjs/server";
import { getMoodsInRange } from "@/lib/services/daily";
import { monthDays, todayKey } from "@/lib/date";

export const metadata = { title: "Mood" };
export const dynamic = "force-dynamic";

export default async function MoodPage() {
  await auth.protect();

  const today = todayKey();
  const dates = monthDays();
  const moods = await getMoodsInRange(dates[0], dates[dates.length - 1]);

  return (
    <div>
      <PageHeader
        title="Mood"
        description="How you've felt each day this month — tap a day to set or change it."
      />
      <MoodStrip dates={dates} today={today} initialMoods={moods} />
    </div>
  );
}
