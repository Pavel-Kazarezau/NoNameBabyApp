import {supabase} from "@/lib/supabase";

export interface AccountMember {
    role: string;
    is_you: boolean;
    display_name: string | null;
    joined_at: string | null;
}

export interface AccountChild {
    id: string;
    name: string;
    birth_date: string | null;
}

export interface AccountFamily {
    id: string;
    name: string;
    role: string;
    joined_at: string | null;
    members: AccountMember[];
    children: AccountChild[];
}

export interface AccountSnapshot {
    user: {id: string; email: string | null; display_name: string | null};
    families: AccountFamily[];
}

export const accountApi = {
    async getSnapshot(): Promise<AccountSnapshot> {
        const {data, error} = await supabase.rpc("get_my_account_snapshot");
        if (error) {
            if (error.code === "PGRST202") {
                throw new Error("The account snapshot RPC is missing from Supabase. Apply supabase/migrations/202611190007_account_snapshot_rpc.sql, then reload the API schema.");
            }
            throw new Error(error.message);
        }
        if (!data || typeof data !== "object") throw new Error("Account snapshot is empty");
        return data as unknown as AccountSnapshot;
    },
};
