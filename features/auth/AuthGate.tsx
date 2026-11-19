import {useEffect, useState} from "react";
import {ActivityIndicator, Text, View} from "react-native";
import type {Session} from "@supabase/supabase-js";
import {useQueryClient} from "@tanstack/react-query";
import {supabase} from "@/lib/supabase";
import AuthScreen from "./AuthScreen";

export default function AuthGate({children}: {children: React.ReactNode}) {
    const queryClient = useQueryClient();
    const [session, setSession] = useState<Session | null>(null);
    const [ready, setReady] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let active = true;
        const {data: {subscription}} = supabase.auth.onAuthStateChange((_event, nextSession) => {
            if (!active) return;
            setSession(nextSession);
            setReady(true);
            setError(null);
        });
        void supabase.auth.getSession().then(({data, error: sessionError}) => {
            if (!active) return;
            if (sessionError) setError(sessionError.message);
            setSession(data.session);
            setReady(true);
        }).catch((cause: unknown) => {
            if (!active) return;
            setError(cause instanceof Error ? cause.message : "Could not restore your session.");
            setReady(true);
        });
        return () => {
            active = false;
            subscription.unsubscribe();
        };
    }, []);

    const userId = session?.user.id;
    const displayName = session?.user.user_metadata?.display_name;
    useEffect(() => {
        if (!userId || typeof displayName !== "string" || !displayName.trim()) return;
        let active = true;
        void supabase.rpc("upsert_my_profile", {p_display_name: displayName.trim()}).then(({error: profileError}) => {
            if (!active || profileError) return;
            void queryClient.invalidateQueries({queryKey: ["account", "snapshot"]});
            void queryClient.invalidateQueries({queryKey: ["responsibility", "members"]});
        });
        return () => { active = false; };
    }, [userId, displayName, queryClient]);

    if (!ready) return <View className="flex-1 items-center justify-center bg-[#f5f7f6]"><ActivityIndicator color="#0f766e"/><Text className="mt-3 text-slate-600">Restoring your session…</Text></View>;
    if (error && !session) return <View className="flex-1 items-center justify-center bg-[#f5f7f6] px-8"><View className="rounded-3xl bg-white p-6"><Text className="text-xl font-bold text-slate-900">Could not restore session</Text><Text className="mt-2 text-slate-600">{error}</Text></View></View>;
    return session ? <>{children}</> : <AuthScreen/>;
}
