import { pageUser } from "@/lib/auth";
import StagePlaceholder from "@/components/stage-placeholder";

export default async function Page() {
  await pageUser("customers:view");
  return <StagePlaceholder titleKey="customers" stage={2} />;
}
