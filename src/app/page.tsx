import { StagedHome } from "@/components/home/StagedHome";
import { listProviderStatuses } from "@/lib/music/providers/registry";

export default async function Home() {
  return <StagedHome providers={await listProviderStatuses()} />;
}
