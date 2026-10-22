import { pageUser } from "@/lib/auth";
import StagePlaceholder from "@/components/stage-placeholder";

export default async function Page() {
  await pageUser("shipments:view");
  return <StagePlaceholder titleKey="shipments" stage={6} />;
}
