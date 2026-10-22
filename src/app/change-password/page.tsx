import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth";
import { Card, Logo } from "@/components/ui";
import ChangePasswordForm from "./form";

export const metadata = { title: "Change password" };

export default async function ChangePasswordPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  const t = await getTranslations("auth");
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <div className="mb-4 flex items-center gap-3">
          <Logo size={48} />
          <div>
            <h1 className="text-lg font-bold">{t("changePassword")}</h1>
            <p className="text-sm text-muted">{me.fullName}</p>
          </div>
        </div>
        {me.mustChangePassword && <p className="mb-4 text-sm">{t("changePasswordIntro")}</p>}
        <ChangePasswordForm />
      </Card>
    </main>
  );
}
