import {useQuery} from "@tanstack/react-query";

import {responsibilityApi} from "../api/responsibility.api";

export const responsibilityKeys = {
    all: ["responsibility"] as const,

    snapshot: (childId: string) =>
        [...responsibilityKeys.all, "snapshot", childId] as const,
};

export function useResponsibilitySnapshot(
    childId: string,
) {
    return useQuery({
        queryKey: responsibilityKeys.snapshot(childId),

        queryFn: () =>
            responsibilityApi.getSnapshot(childId),

        enabled: Boolean(childId),

        staleTime: 10_000,

        retry: 1,
    });
}
