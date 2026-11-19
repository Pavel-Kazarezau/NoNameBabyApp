import {router} from "expo-router";
import {useState} from "react";
import {ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, Text, TextInput, View} from "react-native";
import {SafeAreaView} from "react-native-safe-area-context";
import {useQuery, useQueryClient} from "@tanstack/react-query";
import {supabase} from "@/lib/supabase";
import FamilyInviteButton from "@/features/family/components/FamilyInviteButton";
import {accountApi} from "../api/account.api";

const accountQueryKey = ["account", "snapshot"] as const;
const roleLabels: Record<string, string> = {
    PRIMARY_PARENT: "Parent",
    CO_PARENT: "Co-parent",
    CAREGIVER: "Caregiver",
};
const roleLabel = (role: string) => roleLabels[role] ?? "Family member";
const formatDate = (value: string | null) => {
    if (!value) return "Date of birth not set";
    const [year, month, day] = value.split("-").map(Number);
    return new Intl.DateTimeFormat(undefined, {dateStyle: "long"}).format(new Date(year, month - 1, day));
};

export default function AccountScreen() {
    const queryClient = useQueryClient();
    const [signingOut, setSigningOut] = useState(false);
    const [displayName, setDisplayName] = useState<string | null>(null);
    const [editingName, setEditingName] = useState(false);
    const [savingName, setSavingName] = useState(false);
    const [profileError, setProfileError] = useState<string | null>(null);
    const [signOutError, setSignOutError] = useState<string | null>(null);
    const account = useQuery({queryKey: accountQueryKey, queryFn: accountApi.getSnapshot, staleTime: 30_000});

    const effectiveDisplayName = displayName ?? account.data?.user.display_name ?? "";

    const saveName = async () => {
        const normalizedName = effectiveDisplayName.trim();
        if (!normalizedName || normalizedName.length > 80 || savingName) return;
        setSavingName(true);
        setProfileError(null);
        try {
            const {error: authError} = await supabase.auth.updateUser({data: {display_name: normalizedName}});
            if (authError) throw authError;
            const {error: profileSaveError} = await supabase.rpc("upsert_my_profile", {p_display_name: normalizedName});
            if (profileSaveError?.code === "PGRST202") {
                throw new Error("The profile RPC is missing from Supabase. Apply supabase/migrations/202611190008_user_display_names.sql and reload the API schema.");
            }
            if (profileSaveError) throw new Error(profileSaveError.message);
            setDisplayName(normalizedName);
            setEditingName(false);
            await queryClient.invalidateQueries({queryKey: accountQueryKey});
            await queryClient.invalidateQueries({queryKey: ["responsibility", "members"]});
        } catch (cause) {
            const message = cause instanceof Error
                ? cause.message
                : cause && typeof cause === "object" && "message" in cause && typeof cause.message === "string"
                    ? cause.message
                    : "Could not save your name.";
            setProfileError(message);
        } finally {
            setSavingName(false);
        }
    };

    const signOut = async () => {
        if (signingOut) return;
        setSigningOut(true);
        setSignOutError(null);
        const {error} = await supabase.auth.signOut();
        if (error) {
            setSignOutError(error.message);
            setSigningOut(false);
            return;
        }
        queryClient.clear();
    };

    return <SafeAreaView className="flex-1 bg-[#f5f7f6]" edges={["top", "bottom"]}>
        <ScrollView
            className="flex-1"
            contentContainerClassName="px-5 pb-10 pt-3"
            refreshControl={<RefreshControl refreshing={account.isRefetching} onRefresh={() => void account.refetch()}/>}
        >
            <View className="mb-5 flex-row items-center justify-between">
                <View>
                    <Text className="text-sm font-medium uppercase tracking-widest text-teal-800">BabyCare Hub</Text>
                    <Text className="mt-1 text-3xl font-bold text-slate-900">Account</Text>
                </View>
                <Pressable accessibilityRole="button" onPress={() => router.back()} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                    <Text className="font-semibold text-slate-700">Done</Text>
                </Pressable>
            </View>

            {account.isLoading ? <View className="items-center rounded-3xl bg-white p-6"><ActivityIndicator color="#0f766e"/><Text className="mt-3 text-slate-600">Loading your account…</Text></View> :
                account.isError ? <View className="rounded-3xl bg-white p-5">
                    <Text className="text-lg font-bold text-slate-900">Could not load your account</Text>
                    <Text className="mt-2 text-slate-600">{account.error.message}</Text>
                    <Pressable onPress={() => void account.refetch()} className="mt-4 min-h-12 items-center justify-center rounded-xl bg-teal-700"><Text className="font-semibold text-white">Try again</Text></Pressable>
                </View> : account.data && <>
                    <View className="rounded-3xl bg-white p-5">
                        <Text className="text-lg font-bold text-slate-900">My data</Text>
                        <Text className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">Name shown to your family</Text>
                        {editingName ? <>
                            <TextInput
                                accessibilityLabel="Name shown to your family"
                                autoCapitalize="words"
                                autoCorrect={false}
                                autoFocus
                                maxLength={80}
                                onChangeText={setDisplayName}
                                placeholder="Your name"
                                placeholderTextColor="#94a3b8"
                                value={effectiveDisplayName}
                                className="min-h-12 rounded-xl border border-slate-200 px-4 text-base text-slate-900"
                            />
                            <View className="mt-3 flex-row gap-3">
                                <Pressable accessibilityRole="button" disabled={savingName} onPress={() => { setDisplayName(null); setProfileError(null); setEditingName(false); }} className="min-h-11 flex-1 items-center justify-center rounded-xl border border-slate-200 bg-white">
                                    <Text className="font-semibold text-slate-700">Cancel</Text>
                                </Pressable>
                                <Pressable accessibilityRole="button" disabled={savingName || !effectiveDisplayName.trim()} onPress={() => void saveName()} className={`min-h-11 flex-1 items-center justify-center rounded-xl bg-teal-700 ${savingName || !effectiveDisplayName.trim() ? "opacity-60" : ""}`}>
                                    <Text className="font-semibold text-white">{savingName ? "Saving…" : "Save"}</Text>
                                </Pressable>
                            </View>
                        </> : <View className="flex-row items-center justify-between rounded-xl border border-slate-200 px-4 py-3">
                            <Text className={`flex-1 text-base ${effectiveDisplayName ? "text-slate-900" : "text-slate-400"}`}>{effectiveDisplayName || "Your name"}</Text>
                            <Pressable accessibilityRole="button" accessibilityLabel="Edit name" onPress={() => { setDisplayName(account.data?.user.display_name ?? ""); setProfileError(null); setEditingName(true); }} className="ml-3 rounded-lg bg-teal-50 px-3 py-2">
                                <Text className="font-semibold text-teal-800">Edit</Text>
                            </Pressable>
                        </View>}
                        {profileError && <Text accessibilityRole="alert" className="mt-2 text-sm text-rose-700">{profileError}</Text>}
                        <Text className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">Email</Text>
                        <Text className="text-base text-slate-800">{account.data.user.email ?? "No email available"}</Text>
                        <Text className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">Account ID</Text>
                        <Text selectable className="text-sm text-slate-600">{account.data.user.id}</Text>
                    </View>

                    <View className="mt-5">
                        <Text className="mb-3 ml-1 text-xl font-bold text-slate-900">My family</Text>
                        {account.data.families.length ? account.data.families.map((family) => <View key={family.id} className="mb-4 rounded-3xl bg-white p-5">
                            <Text className="text-xl font-bold text-slate-900">{family.name}</Text>
                            <Text className="mt-1 text-slate-600">Your role: {roleLabel(family.role)}</Text>
                            <View className="mt-4"><FamilyInviteButton familyId={family.id} label="Invite a family member" prominent /></View>

                            <Text className="mb-2 mt-5 text-sm font-semibold uppercase tracking-wide text-slate-500">Members · {family.members.length}</Text>
                            <View className="gap-2">
                                {family.members.map((member, index) => <View key={`${family.id}-${index}`} className="flex-row items-center justify-between rounded-xl bg-slate-50 px-3 py-3">
                                    <Text className="font-medium text-slate-800">{member.display_name || (member.is_you ? "You" : roleLabel(member.role))}</Text>
                                    <Text className="text-sm text-slate-500">{roleLabel(member.role)}</Text>
                                </View>)}
                            </View>

                            <Text className="mb-2 mt-5 text-sm font-semibold uppercase tracking-wide text-slate-500">Children · {family.children.length}</Text>
                            {family.children.length ? <View className="gap-2">
                                {family.children.map((child) => <View key={child.id} className="rounded-xl bg-teal-50 px-3 py-3">
                                    <Text className="font-semibold text-slate-900">{child.name}</Text>
                                    <Text className="mt-1 text-sm text-slate-600">{formatDate(child.birth_date)}</Text>
                                </View>)}
                            </View> : <Text className="text-slate-600">No children added yet.</Text>}
                        </View>) : <View className="rounded-3xl bg-white p-5">
                            <Text className="text-slate-700">You don’t belong to an active family yet.</Text>
                            <Pressable onPress={() => router.push("/family/join")} className="mt-4 min-h-12 items-center justify-center rounded-xl border border-teal-200"><Text className="font-semibold text-teal-800">Join a family</Text></Pressable>
                            <Pressable onPress={() => router.replace("/")} className="mt-3 min-h-12 items-center justify-center rounded-xl bg-teal-700"><Text className="font-semibold text-white">Create a family</Text></Pressable>
                        </View>}
                    </View>
                </>}

            {signOutError && <Text accessibilityRole="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-rose-800">Could not sign out: {signOutError}</Text>}
            <Pressable accessibilityRole="button" disabled={signingOut} onPress={() => Alert.alert("Sign out?", "You can sign back in with this account at any time.", [
                {text: "Cancel", style: "cancel"},
                {text: "Sign out", style: "destructive", onPress: () => void signOut()},
            ])} className={`mt-6 min-h-12 items-center justify-center rounded-xl border border-rose-200 bg-white ${signingOut ? "opacity-60" : ""}`}>
                <Text className="font-semibold text-rose-700">{signingOut ? "Signing out…" : "Sign out"}</Text>
            </Pressable>
        </ScrollView>
    </SafeAreaView>;
}
