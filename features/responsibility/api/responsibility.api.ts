import {supabase} from "@/lib/supabase";
import * as Crypto from "expo-crypto";

import type {ResponsibilityChild, ResponsibilityMember, ResponsibilitySnapshot} from "./responsibility.types";

const pendingKeys = new Map<string, string>();

function idempotencyKey(operation: string, args: Record<string, unknown>) {
    const cacheKey = `${operation}:${JSON.stringify(args)}`;
    let key = pendingKeys.get(cacheKey);
    if (!key) {
        key = Crypto.randomUUID();
        pendingKeys.set(cacheKey, key);
    }
    return {key, cacheKey};
}

async function rpc<T>(name: string, args: Record<string, unknown>, idempotent = false): Promise<T> {
    const cached = idempotent ? idempotencyKey(name, args) : undefined;
    const payload = cached ? {...args, p_idempotency_key: cached.key} : args;
    const {data, error} = await supabase.rpc(name, payload as never);
    if (error) throw new Error(error.message);
    if (cached) pendingKeys.delete(cached.cacheKey);
    return data as T;
}

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

    async getChildren(): Promise<ResponsibilityChild[]> {
        const {data: authData, error: authError} = await supabase.auth.getSession();
        if (authError) throw new Error(`Could not check your Supabase session: ${authError.message}`);
        if (!authData.session) {
            throw new Error("There is no signed-in Supabase session. Sign in as a family member before loading children.");
        }

        const {data, error} = await supabase
            .from("children")
            .select("id, name, birth_date, family_id")
            .order("name");
        if (error) {
            if (error.code === "42501") {
                throw new Error(`Supabase denied SELECT on children for the signed-in session (${error.code}). Confirm that the migration was applied to this Supabase project and that this user has a family_members row with the same auth user ID. Backend message: ${error.message}`);
            }
            throw new Error(`Failed to fetch children: ${error.message}`);
        }
        return (data ?? []) as ResponsibilityChild[];
    },

    async getMembers(familyId: string): Promise<ResponsibilityMember[]> {
        const {data, error} = await supabase
            .from("family_members")
            .select("id, role, user_id")
            .eq("family_id", familyId)
            .eq("status", "ACTIVE");
        if (error) throw new Error(`Failed to fetch family members: ${error.message}`);
        const members = (data ?? []) as Omit<ResponsibilityMember, "display_name">[];
        const userIds = [...new Set(members.map((member) => member.user_id).filter((id): id is string => Boolean(id)))];
        if (!userIds.length) return members.map((member) => ({...member, display_name: null}));

        const {data: profiles, error: profileError} = await supabase
            .from("user_profiles")
            .select("user_id, display_name")
            .in("user_id", userIds);
        if (profileError) throw new Error(`Failed to fetch family member names: ${profileError.message}`);
        const names = new Map((profiles ?? []).map((profile) => [profile.user_id, profile.display_name]));
        return members.map((member) => ({
            ...member,
            display_name: member.user_id ? names.get(member.user_id) ?? null : null,
        }));
    },

    acceptResponsibility(childId: string) {
        return rpc("accept_responsibility", {p_child_id: childId}, true);
    },
    requestHandover(childId: string, toMemberId: string) {
        return rpc("request_handover", {p_child_id: childId, p_to_member_id: toMemberId}, true);
    },
    acceptHandover(handoverId: string) {
        return rpc("accept_handover", {p_handover_id: handoverId}, true);
    },
    createPlan(childId: string, responsibleId: string, start: string, end: string) {
        return rpc("create_responsibility_plan", {
            p_child_id: childId,
            p_responsible_id: responsibleId,
            p_planned_start_at: start,
            p_planned_end_at: end,
        }, true);
    },
    acceptPlan(planId: string) {
        return rpc("accept_responsibility_plan", {p_plan_id: planId});
    },
    cancelHandover(handoverId: string) {
        return rpc("cancel_handover", {p_handover_id: handoverId});
    },
    cancelPlan(planId: string) {
        return rpc("cancel_responsibility_plan", {p_plan_id: planId});
    },
    declineHandover(handoverId: string) {
        return rpc("decline_handover", {p_handover_id: handoverId});
    },
    declinePlan(planId: string) {
        return rpc("decline_responsibility_plan", {p_plan_id: planId});
    },
};
