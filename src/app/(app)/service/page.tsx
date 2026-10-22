import { pageUser } from "@/lib/auth";
import StagePlaceholder from "@/components/stage-placeholder";

export default async function Page() {
  await pageUser("service:view");
  return <StagePlaceholder titleKey="service" stage={4} />;
}
