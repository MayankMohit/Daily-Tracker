import { SignIn } from "@clerk/nextjs";

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
