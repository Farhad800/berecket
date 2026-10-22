import { pageUser } from "@/lib/auth";
import StagePlaceholder from "@/components/stage-placeholder";

export default async function Page() {
  await pageUser("maintenance:view");
  return <StagePlaceholder titleKey="history" stage={4} />;
}
