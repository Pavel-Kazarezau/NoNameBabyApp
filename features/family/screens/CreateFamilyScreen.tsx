import DateTimePicker, {type DateTimePickerEvent} from "@react-native-community/datetimepicker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {router} from "expo-router";
import {useEffect, useState} from "react";
import {ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View} from "react-native";
import {SafeAreaView} from "react-native-safe-area-context";
import {useQueryClient} from "@tanstack/react-query";
import {supabase} from "@/lib/supabase";
import {familyApi} from "../api/family.api";
import {responsibilityCollectionKeys} from "../../responsibility/hooks/useResponsibilitySnapshot";

const formatDate = (date: Date) => new Intl.DateTimeFormat(undefined, {dateStyle: "long"}).format(date);
const dateForDatabase = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export default function CreateFamilyScreen() {
    const queryClient = useQueryClient();
    const [familyName, setFamilyName] = useState("");
    const [childName, setChildName] = useState("");
    const [birthDate, setBirthDate] = useState<Date | null>(null);
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [familyId, setFamilyId] = useState<string | null>(null);
    const [restoringSetup, setRestoringSetup] = useState(true);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let active = true;
        void supabase.auth.getSession().then(async ({data}) => {
            if (!data.session) return;
            const key = `babycare:family-setup:${data.session.user.id}`;
            const pendingFamilyId = await AsyncStorage.getItem(key);
            if (active && pendingFamilyId) setFamilyId(pendingFamilyId);
        }).catch(() => {
            // AuthGate owns session errors; the form remains available for this screen lifetime.
        }).finally(() => {
            if (active) setRestoringSetup(false);
        });
        return () => { active = false; };
    }, []);

    const onDateChange = (event: DateTimePickerEvent, date?: Date) => {
        if (event.type === "dismissed") {
            setShowDatePicker(false);
            return;
        }
        if (date) setBirthDate(date);
        if (Platform.OS !== "ios") setShowDatePicker(false);
    };

    const create = async () => {
        if (loading) return;
        if (!familyName.trim() || !childName.trim()) {
            setError("Enter a family name and child name.");
            return;
        }
        setLoading(true);
        setError(null);
        try {
            let activeFamilyId = familyId;
            if (!activeFamilyId) {
                activeFamilyId = await familyApi.createFamily(familyName);
                setFamilyId(activeFamilyId);
                const {data} = await supabase.auth.getSession();
                if (data.session) {
                    await AsyncStorage.setItem(`babycare:family-setup:${data.session.user.id}`, activeFamilyId).catch(() => undefined);
                }
            }
            const childId = await familyApi.createChild(activeFamilyId, childName, birthDate ? dateForDatabase(birthDate) : null);
            const {data} = await supabase.auth.getSession();
            if (data.session) await AsyncStorage.removeItem(`babycare:family-setup:${data.session.user.id}`).catch(() => undefined);
            await queryClient.invalidateQueries({queryKey: responsibilityCollectionKeys.children});
            router.replace(`/responsibility/${childId}`);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Could not finish family setup.");
        } finally {
            setLoading(false);
        }
    };

    const isChildStep = familyId !== null;

    return <SafeAreaView className="flex-1 bg-[#f5f7f6]" edges={["top", "bottom"]}>
        <KeyboardAvoidingView className="flex-1 justify-center px-5" behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <View className="rounded-3xl bg-white p-5 shadow-sm">
                <Text className="text-sm font-semibold uppercase tracking-widest text-teal-800">BabyCare Hub</Text>
                <Text className="mt-2 text-2xl font-bold text-slate-900">{isChildStep ? "Add your child" : "Create your family"}</Text>
                <Text className="mt-2 leading-6 text-slate-600">{isChildStep ? "Your family is ready. Add a child to start coordinating care." : "Start a private family space for coordinating your child’s care."}</Text>

                {!isChildStep && <>
                    <Text className="mb-2 mt-5 font-semibold text-slate-800">Family name</Text>
                    <TextInput accessibilityLabel="Family name" autoCapitalize="words" onChangeText={setFamilyName} placeholder="For example, The Smith family" placeholderTextColor="#94a3b8" value={familyName} className="min-h-12 rounded-xl border border-slate-200 px-4 text-base text-slate-900" />
                </>}
                <Text className="mb-2 mt-5 font-semibold text-slate-800">Child’s name</Text>
                <TextInput accessibilityLabel="Child’s name" autoCapitalize="words" onChangeText={setChildName} placeholder="Child’s name" placeholderTextColor="#94a3b8" value={childName} className="min-h-12 rounded-xl border border-slate-200 px-4 text-base text-slate-900" />
                <Text className="mb-2 mt-4 font-semibold text-slate-800">Date of birth <Text className="font-normal text-slate-500">(optional)</Text></Text>
                <Pressable accessibilityRole="button" onPress={() => setShowDatePicker(true)} className="min-h-12 justify-center rounded-xl border border-slate-200 px-4">
                    <Text className={birthDate ? "text-base text-slate-900" : "text-base text-slate-400"}>{birthDate ? formatDate(birthDate) : "Choose a date"}</Text>
                </Pressable>
                {showDatePicker && <View className="mt-2 rounded-xl bg-slate-50 p-2">
                    <DateTimePicker value={birthDate ?? new Date()} mode="date" display={Platform.OS === "ios" ? "spinner" : "default"} maximumDate={new Date()} onChange={onDateChange} />
                    {Platform.OS === "ios" && <Pressable onPress={() => setShowDatePicker(false)} className="min-h-11 items-center justify-center"><Text className="font-semibold text-teal-800">Done</Text></Pressable>}
                </View>}
                {error && <Text accessibilityRole="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-rose-800">{error}</Text>}
                <Pressable accessibilityRole="button" disabled={loading || restoringSetup} onPress={create} className={`mt-6 min-h-12 flex-row items-center justify-center rounded-xl bg-teal-700 px-4 ${loading || restoringSetup ? "opacity-60" : ""}`}>
                    {(loading || restoringSetup) && <ActivityIndicator color="white" className="mr-2"/>}
                    <Text className="font-semibold text-white">{restoringSetup ? "Restoring setup…" : loading ? "Setting up…" : isChildStep ? "Add child" : "Create family and continue"}</Text>
                </Pressable>
                {isChildStep && <Text className="mt-3 text-sm leading-5 text-slate-500">The family has already been created. Retrying this step will reuse the same child creation request.</Text>}
                {!isChildStep && <Pressable disabled={loading || restoringSetup} onPress={() => router.push("/family/join")} className="mt-3 min-h-11 items-center justify-center">
                    <Text className="font-semibold text-teal-800">Have an invitation code? Join a family</Text>
                </Pressable>}
                <Pressable disabled={loading || restoringSetup} onPress={() => router.push("/account")} className="min-h-11 items-center justify-center">
                    <Text className="font-semibold text-slate-600">Account</Text>
                </Pressable>
            </View>
        </KeyboardAvoidingView>
    </SafeAreaView>;
}
