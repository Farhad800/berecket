import { pageUser } from "@/lib/auth";
import StagePlaceholder from "@/components/stage-placeholder";

export default async function Page() {
  await pageUser("reports:view");
  return <StagePlaceholder titleKey="reports" stage={7} />;
}
