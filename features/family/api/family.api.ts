import * as Crypto from "expo-crypto";
import {supabase} from "@/lib/supabase";

const pendingChildKeys = new Map<string, string>();

function childRequestKey(familyId: string, name: string, birthDate: string | null) {
    const cacheKey = JSON.stringify([familyId, name.trim(), birthDate]);
    let key = pendingChildKeys.get(cacheKey);
    if (!key) {
        key = Crypto.randomUUID();
        pendingChildKeys.set(cacheKey, key);
    }
    return {cacheKey, key};
}

export const familyApi = {
    async createInvitation(familyId: string, memberRole: "CO_PARENT" | "CAREGIVER"): Promise<{token: string; expiresAt: string}> {
        const token = Crypto.randomUUID();
        const {data, error} = await supabase.rpc("create_family_invitation", {
            p_family_id: familyId,
            p_token: token,
            p_member_role: memberRole,
        });
        if (error) throw new Error(error.message);
        if (typeof data !== "string") throw new Error("create_family_invitation returned no expiration time");
        return {token, expiresAt: data};
    },

    async acceptInvitation(token: string): Promise<string> {
        const {data, error} = await supabase.rpc("accept_family_invitation", {p_token: token.trim()});
        if (error) throw new Error(error.message);
        if (typeof data !== "string") throw new Error("accept_family_invitation returned no family ID");
        return data;
    },

    async createFamily(name: string): Promise<string> {
        const {data, error} = await supabase.rpc("create_family", {p_name: name.trim()});
        if (error) throw new Error(error.message);
        if (typeof data !== "string") throw new Error("create_family returned no family ID");
        return data;
    },

    async createChild(familyId: string, name: string, birthDate: string | null): Promise<string> {
        const request = childRequestKey(familyId, name, birthDate);
        const {data, error} = await supabase.rpc("create_child", {
            p_family_id: familyId,
            p_name: name.trim(),
            p_birth_date: birthDate,
            p_idempotency_key: request.key,
        });
        if (error) throw new Error(error.message);
        if (typeof data !== "string") throw new Error("create_child returned no child ID");
        pendingChildKeys.delete(request.cacheKey);
        return data;
    },
};
