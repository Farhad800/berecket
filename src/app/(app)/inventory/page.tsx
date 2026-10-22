import { pageUser } from "@/lib/auth";
import StagePlaceholder from "@/components/stage-placeholder";

export default async function Page() {
  await pageUser("warehouse:view");
  return <StagePlaceholder titleKey="inventory" stage={6} />;
}
