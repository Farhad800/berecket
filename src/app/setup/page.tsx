import { notFound } from "next/navigation";
import { setupOpen } from "@/app/actions/setup";
import { Card, Logo } from "@/components/ui";
import SetupForm from "./form";

export const metadata = { title: "First-time setup" };
export const dynamic = "force-dynamic";

export default async function SetupPage() {
  // Disappears for good once an administrator exists.
  if (!(await setupOpen())) notFound();
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-lg">
        <div className="mb-4 flex items-center gap-3">
          <Logo size={56} />
          <div>
            <h1 className="text-lg font-bold">Bereket Plastic — first-time setup</h1>
            <p className="text-sm text-muted">Create the first administrator account. This page closes after use.</p>
          </div>
        </div>
        <SetupForm />
      </Card>
    </main>
  );
}
