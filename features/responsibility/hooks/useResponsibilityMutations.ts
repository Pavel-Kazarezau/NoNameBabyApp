import {useMutation, useQueryClient} from "@tanstack/react-query";
import {responsibilityApi} from "../api/responsibility.api";
import {responsibilityKeys} from "./useResponsibilitySnapshot";

export function useResponsibilityMutation<T>(childId: string, mutationFn: (value: T) => Promise<unknown>) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn,
        onSuccess: async () => {
            // The action response confirms the write; immediately fetch the
            // canonical snapshot so the screen doesn't depend on Realtime.
            await queryClient.refetchQueries({
                queryKey: responsibilityKeys.snapshot(childId),
                exact: true,
                type: "active",
            });
        },
    });
}

export function useResponsibilityActions(childId: string) {
    return {
        take: useResponsibilityMutation(childId, () => responsibilityApi.acceptResponsibility(childId)),
        handover: useResponsibilityMutation(childId, (memberId: string) => responsibilityApi.requestHandover(childId, memberId)),
        acceptHandover: useResponsibilityMutation(childId, (id: string) => responsibilityApi.acceptHandover(id)),
        acceptPlan: useResponsibilityMutation(childId, (id: string) => responsibilityApi.acceptPlan(id)),
        declineHandover: useResponsibilityMutation(childId, (id: string) => responsibilityApi.declineHandover(id)),
        declinePlan: useResponsibilityMutation(childId, (id: string) => responsibilityApi.declinePlan(id)),
        cancelHandover: useResponsibilityMutation(childId, (id: string) => responsibilityApi.cancelHandover(id)),
        cancelPlan: useResponsibilityMutation(childId, (id: string) => responsibilityApi.cancelPlan(id)),
        createPlan: useResponsibilityMutation(childId, (value: {memberId: string; start: string; end: string}) =>
            responsibilityApi.createPlan(childId, value.memberId, value.start, value.end)),
    };
}
