import {useQuery} from "@tanstack/react-query";
import {responsibilityApi} from "../api/responsibility.api";


export const responsibilityKeys = {
    all: ["responsibility"] as const,

    snapshot: (childId: string) =>
        [...responsibilityKeys.all, "snapshot", childId] as const,
};

export const responsibilityCollectionKeys = {
    children: ["responsibility", "children"] as const,
    members: (familyId: string) => ["responsibility", "members", familyId] as const,
};

export function useResponsibilityChildren() {
    return useQuery({queryKey: responsibilityCollectionKeys.children, queryFn: responsibilityApi.getChildren});
}

export function useResponsibilityMembers(familyId: string) {
    return useQuery({
        queryKey: responsibilityCollectionKeys.members(familyId),
        queryFn: () => responsibilityApi.getMembers(familyId),
        enabled: Boolean(familyId),
    });
}

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
