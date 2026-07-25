import { SignIn } from "@clerk/nextjs";

export const metadata = {
  title: "Sign in",
  description: "Sign in to LockedIn to track your tasks, habits, mood, and journal.",
};

// In-app sign-in page. Hosting it on the app's own domain (instead of the
// hosted Account Portal on the accounts.* subdomain) keeps the session cookie
// first-party and avoids the cross-subdomain handshake redirect loop.
export default function SignInPage() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <SignIn />
    </div>
  );
}
