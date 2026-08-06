import { DashboardSkeleton } from "@/components/skeletons";

// Shown instantly on navigation to the dashboard (and as the fallback for any
// child route without its own loading.tsx) while the server component streams in.
export default function Loading() {
  return <DashboardSkeleton />;
}
