import { pageUser } from "@/lib/auth";
import StagePlaceholder from "@/components/stage-placeholder";

export default async function Page() {
  await pageUser("qc:view");
  return <StagePlaceholder titleKey="qc" stage={5} />;
}
