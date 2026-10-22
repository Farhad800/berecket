import { pageUser } from "@/lib/auth";
import StagePlaceholder from "@/components/stage-placeholder";

export default async function Page() {
  await pageUser("orders:view");
  return <StagePlaceholder titleKey="notifications" stage={7} />;
}
