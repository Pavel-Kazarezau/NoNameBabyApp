import {router} from "expo-router";
import {useState} from "react";
import {ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View} from "react-native";
import {SafeAreaView} from "react-native-safe-area-context";
import {useQueryClient} from "@tanstack/react-query";
import {familyApi} from "@/features/family/api/family.api";
import {responsibilityApi} from "@/features/responsibility/api/responsibility.api";
import {responsibilityCollectionKeys} from "@/features/responsibility/hooks/useResponsibilitySnapshot";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default function JoinFamilyScreen() {
    const queryClient = useQueryClient();
    const [token, setToken] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const join = async () => {
        const normalizedToken = token.trim();
        if (!uuidPattern.test(normalizedToken)) {
            setError("Enter the invitation code exactly as it was shared with you.");
            return;
        }
        if (loading) return;
        setLoading(true);
        setError(null);
        try {
            const familyId = await familyApi.acceptInvitation(normalizedToken);
            const children = await responsibilityApi.getChildren();
            queryClient.setQueryData(responsibilityCollectionKeys.children, children);
            const child = children.find((entry) => entry.family_id === familyId) ?? children[0];
            router.replace(child ? `/responsibility/${child.id}` : "/");
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Could not join this family.");
        } finally {
            setLoading(false);
        }
    };

    return <SafeAreaView className="flex-1 justify-center bg-[#f5f7f6] px-5" edges={["top", "bottom"]}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <View className="rounded-3xl bg-white p-6 shadow-sm">
                <Text className="text-sm font-semibold uppercase tracking-widest text-teal-800">BabyCare Hub</Text>
                <Text className="mt-3 text-2xl font-bold text-slate-900">Join a family</Text>
                <Text className="mt-2 leading-6 text-slate-600">Paste the invitation code shared by a family member. Codes expire after 7 days.</Text>
                <Text className="mb-2 mt-6 font-semibold text-slate-800">Invitation code</Text>
                <TextInput
                    accessibilityLabel="Invitation code"
                    autoCapitalize="none"
                    autoCorrect={false}
                    onChangeText={setToken}
                    onSubmitEditing={join}
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    placeholderTextColor="#94a3b8"
                    returnKeyType="go"
                    value={token}
                    className="min-h-12 rounded-xl border border-slate-200 px-4 text-base text-slate-900"
                />
                {error && <Text accessibilityRole="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-rose-800">{error}</Text>}
                <Pressable accessibilityRole="button" disabled={loading} onPress={join} className={`mt-5 min-h-12 flex-row items-center justify-center rounded-xl bg-teal-700 px-4 ${loading ? "opacity-60" : ""}`}>
                    {loading && <ActivityIndicator color="white" className="mr-2"/>}
                    <Text className="font-semibold text-white">{loading ? "Joining…" : "Join family"}</Text>
                </Pressable>
                <Pressable disabled={loading} onPress={() => router.back()} className="mt-3 min-h-11 items-center justify-center">
                    <Text className="font-semibold text-slate-600">Cancel</Text>
                </Pressable>
            </View>
        </KeyboardAvoidingView>
    </SafeAreaView>;
}
