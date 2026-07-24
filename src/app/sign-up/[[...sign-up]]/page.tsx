import { SignUp } from "@clerk/nextjs";

// In-app sign-up page — same-domain counterpart to the sign-in page. See
// src/app/sign-in/[[...sign-in]]/page.tsx for why these live in the app.
export default function SignUpPage() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <SignUp />
    </div>
  );
}
