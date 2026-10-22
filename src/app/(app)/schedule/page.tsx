import { pageUser } from "@/lib/auth";
import StagePlaceholder from "@/components/stage-placeholder";

export default async function Page() {
  await pageUser("schedule:view");
  return <StagePlaceholder titleKey="schedule" stage={2} />;
}
