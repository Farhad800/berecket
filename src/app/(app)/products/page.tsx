import { pageUser } from "@/lib/auth";
import StagePlaceholder from "@/components/stage-placeholder";

export default async function Page() {
  await pageUser("products:view");
  return <StagePlaceholder titleKey="products" stage={2} />;
}
