import type { NextRequest } from "next/server";
import { withUser, readJson } from "@/lib/server/http";
import { RequestError } from "@/lib/server/errors";
import { guideInputSchema } from "@/lib/ai/guide-contract";
import { answerGuide } from "@/lib/ai/guide";
export const runtime = "nodejs";
export function POST(request: NextRequest) {
    return withUser(request, async (userId) => {
        const input = guideInputSchema.safeParse(await readJson(request));
        if (!input.success)
            throw new RequestError(400, "请选择节点并填写 1–240 字的问题。", "INVALID_GUIDE_INPUT");
        return (await answerGuide(userId, input.data));
    });
}
