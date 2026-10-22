import { pageUser } from "@/lib/auth";
import StagePlaceholder from "@/components/stage-placeholder";

export default async function Page() {
  await pageUser("production:view");
  return <StagePlaceholder titleKey="production" stage={3} />;
}
