import { listProviderStatuses } from "@/lib/music/providers/registry";

export async function GET() {
  return Response.json(await listProviderStatuses());
}
