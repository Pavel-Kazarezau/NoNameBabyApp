import {supabase} from "@/lib/supabase";

import type {ResponsibilitySnapshot,} from "./responsibility.types";

export const responsibilityApi = {
    async getSnapshot(
        childId: string,
    ): Promise<ResponsibilitySnapshot> {
        const {data, error} = await supabase.rpc(
            "get_responsibility_snapshot",
            {
                p_child_id: childId,
            },
        );

        if (error) {
            throw new Error(
                `Failed to fetch responsibility snapshot: ${error.message}`,
            );
        }

        if (!data) {
            throw new Error(
                "Responsibility snapshot is empty",
            );
        }

        return data as unknown as ResponsibilitySnapshot;
    },
};
