import { pageUser } from "@/lib/auth";
import StagePlaceholder from "@/components/stage-placeholder";

export default async function Page() {
  await pageUser("assets:view");
  return <StagePlaceholder titleKey="assets" stage={2} />;
}
