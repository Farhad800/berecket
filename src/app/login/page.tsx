import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import LanguageSwitcher from "@/components/language-switcher";
import LoginForm from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/dashboard");
  const t = await getTranslations();
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      {/* Brand panel — uses the logo's own navy so the logo sits seamlessly */}
      <section className="logo-tile relative flex flex-col items-center justify-center gap-6 px-6 py-10 text-center text-white lg:py-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/bereket-logo.jpg"
          alt="Bereket Plastic logo"
          width={568}
          height={533}
          className="h-auto w-48 rounded-3xl shadow-2xl ring-1 ring-white/15 sm:w-64 lg:w-72"
        />
        <div className="max-w-md">
          <p className="text-2xl font-bold tracking-tight sm:text-3xl">{t("app.company")}</p>
          <p className="mt-1 text-brand-100">{t("app.system")}</p>
          <p className="mt-4 hidden text-sm text-brand-200 lg:block">{t("app.tagline")}</p>
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-white/10 lg:hidden" />
      </section>

      <section className="flex flex-col justify-center px-5 py-10 sm:px-10">
        <div className="mx-auto w-full max-w-sm">
          <LanguageSwitcher className="mb-8 justify-end" />
          <h1 className="text-2xl font-bold leading-snug">{t("app.welcome")}</h1>
          <p className="mt-2 text-sm text-muted">{t("auth.signIn")}</p>
          <LoginForm />
          <p className="mt-6 text-xs text-muted">{t("auth.help")}</p>
        </div>
      </section>
    </main>
  );
}
