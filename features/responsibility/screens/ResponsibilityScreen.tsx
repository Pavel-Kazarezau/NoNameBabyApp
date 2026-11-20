import DateTimePicker, {type DateTimePickerEvent} from "@react-native-community/datetimepicker";
import {useLocalSearchParams, router} from "expo-router";
import {useEffect, useState} from "react";
import {ActivityIndicator, Alert, Modal, Platform, Pressable, RefreshControl, ScrollView, Text, View} from "react-native";
import {SafeAreaView} from "react-native-safe-area-context";
import {supabase} from "@/lib/supabase";
import CreateFamilyScreen from "@/features/family/screens/CreateFamilyScreen";
import {useResponsibilityActions} from "../hooks/useResponsibilityMutations";
import {responsibilityKeys, useResponsibilityChildren, useResponsibilityMembers, useResponsibilitySnapshot} from "../hooks/useResponsibilitySnapshot";
import type {FamilyMemberRole, ResponsibilityChild, ResponsibilityMember, ResponsibilitySnapshot} from "../api/responsibility.types";
import {useQueryClient} from "@tanstack/react-query";

const labels: Record<string, string> = {
    PRIMARY_PARENT: "Parent", CO_PARENT: "Co-parent", CAREGIVER: "Caregiver",
};
let realtimeChannelSequence = 0;
const roleName = (role?: FamilyMemberRole | string | null) => role ? labels[role] ?? "Family member" : "Family member";
const formatTime = (value: string) => new Intl.DateTimeFormat(undefined, {dateStyle: "medium", timeStyle: "short"}).format(new Date(value));
const formatPlanDate = (value: Date) => new Intl.DateTimeFormat(undefined, {weekday: "short", month: "short", day: "numeric"}).format(value);
const formatPlanTime = (value: Date) => new Intl.DateTimeFormat(undefined, {hour: "numeric", minute: "2-digit"}).format(value);
const nextHour = () => {
    const date = new Date();
    date.setMinutes(0, 0, 0);
    date.setHours(date.getHours() + 1);
    return date;
};
const memberLabel = (member: ResponsibilityMember | undefined) => member
    ? member.display_name?.trim() || roleName(member.role)
    : "Family member";

export default function ResponsibilityScreen() {
    const {childId: routeChildId} = useLocalSearchParams<{childId?: string}>();
    const queryClient = useQueryClient();
    const children = useResponsibilityChildren();
    const selectedChildId = routeChildId ?? children.data?.[0]?.id ?? "";
    const child = children.data?.find((entry) => entry.id === selectedChildId);
    const [realtimeError, setRealtimeError] = useState<string | null>(null);
    const snapshotQuery = useResponsibilitySnapshot(selectedChildId);
    const snapshot = snapshotQuery.data;
    const membersQuery = useResponsibilityMembers(child?.family_id ?? "");
    const members = membersQuery.data ?? [];
    const otherMembers = members.filter((member) => member.id !== snapshotQuery.data?.current_user_member_id);
    const onlyOtherMember = otherMembers.length === 1 ? otherMembers[0] : undefined;
    const actions = useResponsibilityActions(selectedChildId);
    const [now, setNow] = useState(0);
    const [planOpen, setPlanOpen] = useState(false);
    const [picker, setPicker] = useState<"date" | "time" | null>(null);
    const [planMember, setPlanMember] = useState("");
    const [realtimeRetryKey, setRealtimeRetryKey] = useState(0);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [planStart, setPlanStart] = useState(nextHour);
    const [planDurationHours, setPlanDurationHours] = useState(2);
    const [planValidationError, setPlanValidationError] = useState<string | null>(null);
    const planEnd = new Date(planStart.getTime() + planDurationHours * 60 * 60_000);
    const busy = Object.values(actions).some((mutation) => mutation.isPending);
    const mutationError = Object.values(actions).find((mutation) => mutation.error)?.error;
    const refreshScreen = () => {
        setRealtimeError(null);
        setRealtimeRetryKey((key) => key + 1);
        Object.values(actions).forEach((mutation) => mutation.reset());
        setIsRefreshing(true);
        void Promise.all([
            children.refetch(),
            ...(selectedChildId ? [snapshotQuery.refetch()] : []),
            ...(child?.family_id ? [membersQuery.refetch()] : []),
        ]).finally(() => setIsRefreshing(false));
    };
    const optimisticallySetResponsibleToMe = () => {
        const responsible = snapshot?.responsibility;
        const member = members.find((item) => item.id === snapshot?.current_user_member_id);
        if (!responsible || !member) return undefined;

        const queryKey = responsibilityKeys.snapshot(selectedChildId);
        const previousSnapshot = queryClient.getQueryData<ResponsibilitySnapshot>(queryKey);
        const startedAt = new Date().toISOString();
        queryClient.setQueryData<ResponsibilitySnapshot>(queryKey, (current) => current?.responsibility ? ({
            ...current,
            responsibility: {
                ...current.responsibility,
                current_responsible_id: member.id,
                responsible_user_id: member.user_id ?? current.responsibility.responsible_user_id,
                responsible_role: member.role,
                started_at: startedAt,
                version: current.responsibility.version + 1,
                updated_at: startedAt,
            },
        }) : current);
        return () => {
            if (previousSnapshot) queryClient.setQueryData(queryKey, previousSnapshot);
        };
    };
    const takeOverNow = () => {
        const rollback = optimisticallySetResponsibleToMe();
        actions.take.mutate(undefined, {onError: rollback});
    };

    useEffect(() => {
        if (!routeChildId && children.data?.[0]) router.replace(`/responsibility/${children.data[0].id}`);
    }, [children.data, routeChildId]);
    useEffect(() => {
        const initial = setTimeout(() => setNow(Date.now()), 0);
        const timer = setInterval(() => setNow(Date.now()), 60_000);
        return () => { clearTimeout(initial); clearInterval(timer); };
    }, []);
    useEffect(() => {
        if (!selectedChildId) return;
        let active = true;
        setRealtimeError(null);
        // Supabase reuses an existing channel when the topic name matches.
        // A rapid remount can therefore return an already-subscribed channel
        // before the previous effect's asynchronous cleanup has completed.
        const channel = supabase.channel(`responsibility-${selectedChildId}-${++realtimeChannelSequence}`);
        const refreshSnapshot = () => {
            void queryClient.invalidateQueries({queryKey: responsibilityKeys.snapshot(selectedChildId)});
        };
        channel
            .on("postgres_changes", {event: "*", schema: "public", table: "responsibilities", filter: `child_id=eq.${selectedChildId}`}, refreshSnapshot)
            .on("postgres_changes", {event: "*", schema: "public", table: "responsibility_periods", filter: `child_id=eq.${selectedChildId}`}, refreshSnapshot)
            .on("postgres_changes", {event: "*", schema: "public", table: "responsibility_plans", filter: `child_id=eq.${selectedChildId}`}, refreshSnapshot)
            .on("postgres_changes", {event: "*", schema: "public", table: "handovers", filter: `child_id=eq.${selectedChildId}`}, refreshSnapshot)
            .subscribe((status, error) => {
                if (!active) return;
                if (status === "SUBSCRIBED") {
                    setRealtimeError(null);
                    // Reconcile state after reconnects so changes made while
                    // the app was offline are reflected immediately.
                    refreshSnapshot();
                } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
                    const detail = error instanceof Error ? error.message : "Connection interrupted";
                    console.warn(`[Responsibility Realtime] ${status}`, error ?? detail);
                    setRealtimeError(`${status}: ${detail}`);
                }
            });
        return () => {
            active = false;
            void supabase.removeChannel(channel);
        };
    }, [selectedChildId, queryClient, realtimeRetryKey]);

    const currentResponsible = members.find((member) => member.id === snapshot?.responsibility?.current_responsible_id);
    const planResponsible = members.find((member) => member.id === snapshot?.next_plan?.responsible_id);
    const pendingPlanMember = members.find((member) => member.id === snapshot?.pending_plan?.responsible_id);
    const handoverRequester = members.find((member) => member.id === snapshot?.pending_handover?.from_parent_id);
    const handoverTarget = members.find((member) => member.id === snapshot?.pending_handover?.to_parent_id);
    const incomingHandover = snapshot?.pending_handover?.to_parent_id === snapshot?.current_user_member_id;
    const incomingPlan = snapshot?.pending_plan?.responsible_id === snapshot?.current_user_member_id;
    const hasOpenCoordination = Boolean(snapshot?.pending_handover || snapshot?.pending_plan || snapshot?.next_plan);
    const hasPendingCoordination = Boolean(snapshot?.pending_handover || snapshot?.pending_plan);
    const isSoleMember = membersQuery.isSuccess && members.length === 1;
    const isCurrentUserResponsible = snapshot?.responsibility?.current_responsible_id === snapshot?.current_user_member_id;
    const duration = (() => {
        if (!snapshot?.responsibility?.started_at || !now) return "";
        const mins = Math.max(0, Math.floor((now - new Date(snapshot.responsibility.started_at).getTime()) / 60_000));
        const hours = Math.floor(mins / 60);
        const minutes = mins % 60;
        return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
    })();
    const confirm = (title: string, message: string, operation: () => void) => Alert.alert(title, message, [
        {text: "Not now", style: "cancel"}, {text: "Yes", onPress: operation},
    ]);
    const submitPlan = () => {
        if (!planMember) {
            setPlanValidationError("Pick who’s next.");
            return;
        }
        if (planStart <= new Date()) {
            setPlanValidationError("Choose a future start time.");
            return;
        }
        setPlanValidationError(null);
        actions.createPlan.mutate({memberId: planMember, start: planStart.toISOString(), end: planEnd.toISOString()}, {onSuccess: () => setPlanOpen(false)});
    };
    const onDateChange = (event: DateTimePickerEvent, date?: Date) => {
        if (event.type === "dismissed") { setPicker(null); return; }
        if (date) {
            setPlanStart((current) => {
                const updated = new Date(current);
                if (picker === "date") updated.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
                if (picker === "time") updated.setHours(date.getHours(), date.getMinutes(), 0, 0);
                return updated;
            });
            setPlanValidationError(null);
        }
        setPicker(null);
    };
    const openPlan = () => {
        setPlanMember(otherMembers[0]?.id ?? "");
        setPlanStart(nextHour());
        setPlanDurationHours(2);
        setPlanValidationError(null);
        setPicker(null);
        setPlanOpen(true);
    };
    if (children.isLoading) return <StateScreen title="Loading your family…" loading />;
    if (children.isError) return <StateScreen title="Couldn’t load your family" detail="Check your connection and try again." action="Try again" onAction={() => void children.refetch()} />;
    if (!children.data?.length) return <CreateFamilyScreen />;
    if (!selectedChildId || !child) return <StateScreen title="Loading responsibility…" loading />;
    if (snapshotQuery.isLoading) return <StateScreen title={`Responsibility for ${child.name}`} loading />;
    if (snapshotQuery.isError) return <StateScreen title="Couldn’t load this screen" detail="Check your connection and try again." action="Try again" onAction={() => void snapshotQuery.refetch()} />;
    if (!snapshot) return <StateScreen title="Nothing to show yet" detail="Pull down to refresh." />;

    const showAction = (text: string, onPress: () => void, secondary = false) => (
        <Pressable accessibilityRole="button" disabled={busy} onPress={onPress} className={`min-h-12 items-center justify-center rounded-xl px-4 py-3 ${secondary ? "border border-slate-200 bg-white" : "bg-teal-700"} ${busy ? "opacity-50" : ""}`}>
            <Text className={`text-base font-semibold ${secondary ? "text-slate-800" : "text-white"}`}>{text}</Text>
        </Pressable>
    );
    const actionError = mutationError ? "Couldn’t save that. Try again." : null;

    return <SafeAreaView className="flex-1 bg-[#f5f7f6]" edges={["top", "left", "right"]}>
        <ScrollView className="flex-1" contentContainerClassName="px-5 pb-10 pt-3" refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refreshScreen} />}>
            <View className="mb-5 flex-row items-center justify-between">
                <View><Text className="text-sm font-medium uppercase tracking-widest text-teal-800">BabyCare Hub</Text><Text className="mt-1 text-3xl font-bold text-slate-900">Who’s on?</Text></View>
                <View className="items-end gap-2">
                    <View className="flex-row gap-2">
                        {children.data.length > 1 && <Pressable onPress={() => Alert.alert("Choose a child", undefined, [...children.data!.map((item: ResponsibilityChild) => ({text: item.name, onPress: () => { router.replace(`/responsibility/${item.id}`); }})), {text: "Cancel", style: "cancel" as const}])} className="rounded-xl border border-slate-200 bg-white px-3 py-2"><Text className="font-semibold text-slate-700">{child.name}⌄</Text></Pressable>}
                    </View>
                    <Pressable accessibilityRole="button" onPress={() => router.push("/account")} className="px-2 py-1"><Text className="text-sm font-medium text-slate-600">Account</Text></Pressable>
                </View>
            </View>
            {realtimeError && <Text accessibilityRole="alert" className="mb-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">Live updates paused. Pull down to refresh.</Text>}
            <View className="rounded-3xl bg-white p-5 shadow-sm">
                <Text className="text-sm font-semibold uppercase tracking-wide text-slate-500">{child.name} · on duty now</Text>
                {snapshot.responsibility ? <>
                    <View className={`mt-4 rounded-2xl p-4 ${isCurrentUserResponsible ? "bg-teal-50" : "bg-slate-50"}`}>
                        <Text className={`text-xl font-bold ${isCurrentUserResponsible ? "text-teal-950" : "text-slate-900"}`}>{isCurrentUserResponsible ? "You’re on duty" : `${memberLabel(currentResponsible)} is on duty`}</Text>
                        <Text className={`mt-1 ${isCurrentUserResponsible ? "text-teal-900" : "text-slate-600"}`}>For {duration}</Text>
                    </View>
                </> : <Text className="mt-3 text-slate-600">No one’s on duty yet.</Text>}
                {isSoleMember ? <View className="mt-4 rounded-2xl bg-slate-50 p-4">
                    <Text className="font-semibold text-slate-800">Just you for now</Text>
                    <Text className="mt-1 leading-5 text-slate-600">Add someone to share the care.</Text>
                </View> : membersQuery.isLoading ? <View className="mt-4 flex-row items-center gap-2"><ActivityIndicator color="#0f766e"/><Text className="text-slate-500">Loading…</Text></View> : otherMembers.length > 0 && <View className="mt-4 gap-3">
                    {!isCurrentUserResponsible && !snapshot.pending_handover && !snapshot.pending_plan && showAction("Take over now", () => confirm("Take over?", "You’ll be on duty now.", takeOverNow))}
                    {isCurrentUserResponsible && !hasPendingCoordination && showAction("Ask someone to take over", () => {
                        if (onlyOtherMember) {
                            if (snapshot.next_plan) {
                                Alert.alert("Ask them to take over?", "Your scheduled turn will stay in place.", [
                                    {text: "Not now", style: "cancel"},
                                    {text: "Send request", onPress: () => actions.handover.mutate(onlyOtherMember.id)},
                                ]);
                                return;
                            }
                            actions.handover.mutate(onlyOtherMember.id);
                            return;
                        }
                        const options = otherMembers.map((member) => ({text: memberLabel(member), onPress: () => actions.handover.mutate(member.id)}));
                        const message = snapshot.next_plan
                            ? "The scheduled turn stays in place. Choose who should take over now. They’ll need to accept."
                            : "Choose who should take over. They’ll need to accept.";
                        Alert.alert("Ask someone to take over", message, [...options, {text: "Cancel", style: "cancel" as const}]);
                    })}
                    {!hasOpenCoordination && showAction("Schedule a turn", openPlan, true)}
                    {hasOpenCoordination && <Text className="text-sm leading-5 text-slate-500">Finish the current request or turn first.</Text>}
                </View>}
                {membersQuery.isSuccess && members.length === 0 && <Text className="mt-4 text-sm leading-5 text-amber-800">No family members found. Pull down to refresh.</Text>}
            </View>

            <View className="mt-5 rounded-3xl bg-white p-5">
                <Text className="text-lg font-bold text-slate-900">Next turn</Text>
                {snapshot.next_plan ? <View className="mt-3 rounded-2xl bg-amber-50 p-4">
                    <Text className="font-semibold text-slate-900">{memberLabel(planResponsible)} · {snapshot.next_plan.status === "SCHEDULED" ? "Planned" : "In progress"}</Text>
                    <Text className="mt-1 text-slate-700">{formatTime(snapshot.next_plan.planned_start_at)} – {formatTime(snapshot.next_plan.planned_end_at)}</Text>
                    {snapshot.next_plan.status === "SCHEDULED" && <Text className="mt-2 text-amber-900">Switches over at the start, then back at the end.</Text>}
                    {showAction("Cancel plan", () => confirm("Cancel this plan?", "This removes it for everyone.", () => actions.cancelPlan.mutate(snapshot.next_plan!.id)), true)}
                </View> : <Text className="mt-2 text-slate-600">No turns planned.</Text>}
                {snapshot.planned_relief_window && <Text className="mt-3 text-sm text-slate-500">Extra help · {formatTime(snapshot.planned_relief_window.starts_at)} – {formatTime(snapshot.planned_relief_window.ends_at)}</Text>}
            </View>

            {(snapshot.pending_handover || snapshot.pending_plan) && <View className="mt-5 rounded-3xl bg-white p-5">
                <Text className="text-lg font-bold text-slate-900">Open request</Text>
                {snapshot.pending_handover && <View className="mt-3 rounded-2xl border border-slate-200 p-4">
                    <Text className="font-semibold text-slate-900">{incomingHandover ? `${memberLabel(handoverRequester)} asked you to take over` : `Waiting for ${memberLabel(handoverTarget)}`}</Text>
                    {incomingHandover ? <View className="mt-3 gap-2">
                        {showAction("Take over", () => confirm("Take over?", "You’ll be on duty now.", () => {
                            const rollback = optimisticallySetResponsibleToMe();
                            actions.acceptHandover.mutate(snapshot.pending_handover!.id, {onError: rollback});
                        }))}
                        {showAction("Not now", () => confirm("Say no?", "This request will be removed.", () => actions.declineHandover.mutate(snapshot.pending_handover!.id)), true)}
                    </View> : showAction("Cancel request", () => confirm("Cancel this request?", "This removes it for everyone.", () => actions.cancelHandover.mutate(snapshot.pending_handover!.id)), true)}
                </View>}
                {snapshot.pending_plan && <View className="mt-3 rounded-2xl border border-slate-200 p-4">
                    <Text className="font-semibold text-slate-900">{incomingPlan ? "A turn planned for you" : `Waiting for ${memberLabel(pendingPlanMember)}`}</Text>
                    <Text className="mt-1 text-slate-600">{memberLabel(pendingPlanMember)} · {formatTime(snapshot.pending_plan.planned_start_at)} – {formatTime(snapshot.pending_plan.planned_end_at)}</Text>
                    {incomingPlan ? <View className="mt-3 gap-2">
                        {showAction("Accept plan", () => actions.acceptPlan.mutate(snapshot.pending_plan!.id))}
                        {showAction("Not now", () => confirm("Say no?", "This plan request will be removed.", () => actions.declinePlan.mutate(snapshot.pending_plan!.id)), true)}
                    </View> : showAction("Cancel plan", () => confirm("Cancel this plan?", "This removes it for everyone.", () => actions.cancelPlan.mutate(snapshot.pending_plan!.id)), true)}
                </View>}
            </View>}
            {membersQuery.isError && <Text className="mt-4 text-sm text-rose-700">Couldn’t load your family. Pull down to refresh.</Text>}
            {actionError && <View accessibilityRole="alert" className="mt-4 rounded-xl bg-rose-50 p-4"><Text className="font-semibold text-rose-900">That didn’t work</Text><Text className="mt-1 text-rose-800">{actionError}</Text></View>}
            {busy && <View className="mt-3 flex-row items-center gap-2"><ActivityIndicator color="#0f766e"/><Text className="text-slate-600">One sec…</Text></View>}
        </ScrollView>

        <Modal visible={planOpen} animationType="slide" transparent onRequestClose={() => setPlanOpen(false)}>
            <View className="flex-1 justify-end bg-black/40">
                <Pressable accessibilityRole="button" accessibilityLabel="Close plan form" onPress={() => setPlanOpen(false)} className="absolute inset-0" />
                <View className="rounded-t-3xl bg-white px-5 pb-8 pt-3" style={{maxHeight: "90%"}}>
                    <View className="mb-4 self-center rounded-full bg-slate-300" style={{width: 38, height: 5}} />
                    <View className="mb-2 flex-row items-start justify-between">
                        <View className="mr-4 flex-1">
                            <Text className="text-2xl font-bold text-slate-900">Plan a turn</Text>
                            <Text className="mt-1 leading-5 text-slate-600">Pick a person and a time.</Text>
                        </View>
                        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => setPlanOpen(false)} className="h-10 w-10 items-center justify-center rounded-full bg-slate-100"><Text className="text-xl text-slate-600">×</Text></Pressable>
                    </View>
                    <ScrollView className="shrink" showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                        {onlyOtherMember ? <View className="mt-4 rounded-2xl bg-teal-50 px-4 py-3"><Text className="text-sm text-teal-800">Turn for</Text><Text className="mt-0.5 font-semibold text-teal-950">{memberLabel(onlyOtherMember)}</Text></View> : <>
                            <Text className="mb-2 mt-4 font-semibold text-slate-800">Who’s next?</Text>
                            <View className="gap-2">
                                {otherMembers.map((member) => {
                                    const selected = planMember === member.id;
                                    return <Pressable
                                        key={member.id}
                                        accessibilityRole="radio"
                                        accessibilityState={{checked: selected}}
                                        onPress={() => {setPlanMember(member.id); setPlanValidationError(null);}}
                                        className={`min-h-16 flex-row items-center rounded-2xl border px-4 py-3 ${selected ? "border-teal-700 bg-teal-50" : "border-slate-200 bg-white"}`}
                                    >
                                        <View className={`mr-3 h-5 w-5 items-center justify-center rounded-full border-2 ${selected ? "border-teal-700" : "border-slate-300"}`}>
                                            {selected && <View className="h-2.5 w-2.5 rounded-full bg-teal-700"/>}
                                        </View>
                                        <View className="flex-1">
                                            <Text className="font-semibold text-slate-900">{memberLabel(member)}</Text>
                                        </View>
                                    </Pressable>;
                                })}
                            </View>
                        </>}

                        <Text className="mb-2 mt-5 font-semibold text-slate-800">Start</Text>
                        <View className="flex-row gap-3">
                            <Pressable accessibilityRole="button" onPress={() => setPicker("date")} className="min-h-16 flex-1 justify-center rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                                <Text className="text-xs font-medium uppercase tracking-wide text-slate-500">Date</Text>
                                <Text className="mt-1 text-base font-semibold text-slate-900">{formatPlanDate(planStart)}</Text>
                            </Pressable>
                            <Pressable accessibilityRole="button" onPress={() => setPicker("time")} className="min-h-16 flex-1 justify-center rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                                <Text className="text-xs font-medium uppercase tracking-wide text-slate-500">Time</Text>
                                <Text className="mt-1 text-base font-semibold text-slate-900">{formatPlanTime(planStart)}</Text>
                            </Pressable>
                        </View>
                        {picker && <DateTimePicker value={planStart} mode={picker === "date" ? "date" : "time"} display={Platform.OS === "ios" ? "spinner" : "default"} minimumDate={picker === "date" ? new Date() : undefined} onChange={onDateChange} />}
                        <Text className="mb-2 mt-5 font-semibold text-slate-800">For how long?</Text>
                        <View className="flex-row gap-2">
                            {[2, 4, 6, 8].map((hours) => {
                                const selected = planDurationHours === hours;
                                return <Pressable key={hours} accessibilityRole="radio" accessibilityState={{checked: selected}} onPress={() => setPlanDurationHours(hours)} className={`min-h-11 flex-1 items-center justify-center rounded-xl border ${selected ? "border-teal-700 bg-teal-700" : "border-slate-200 bg-white"}`}>
                                    <Text className={`font-semibold ${selected ? "text-white" : "text-slate-700"}`}>{hours}h</Text>
                                </Pressable>;
                            })}
                        </View>

                        <View className="mt-5 rounded-2xl bg-amber-50 p-4">
                            <Text className="mt-1 font-semibold text-slate-900">{memberLabel(otherMembers.find((member) => member.id === planMember))} takes responsibility</Text>
                            <Text className="mt-1 leading-5 text-slate-700">{formatPlanDate(planStart)} · {formatPlanTime(planStart)}–{formatPlanTime(planEnd)}</Text>
                            <Text className="mt-2 text-sm leading-5 text-amber-900">They’ll confirm first.</Text>
                        </View>
                        {planValidationError && <Text accessibilityRole="alert" className="mt-3 rounded-xl bg-rose-50 p-3 text-rose-800">{planValidationError}</Text>}
                    </ScrollView>
                    <View className="mt-4 gap-2 border-t border-slate-100 pt-4">
                        <Pressable accessibilityRole="button" disabled={busy} onPress={submitPlan} className={`min-h-12 flex-row items-center justify-center rounded-xl bg-teal-700 px-4 ${busy ? "opacity-50" : ""}`}>
                            {actions.createPlan.isPending && <ActivityIndicator color="white" className="mr-2"/>}
                            <Text className="text-base font-semibold text-white">{actions.createPlan.isPending ? "Sending…" : "Ask to schedule"}</Text>
                        </Pressable>
                        <Pressable accessibilityRole="button" disabled={actions.createPlan.isPending} onPress={() => setPlanOpen(false)} className="min-h-11 items-center justify-center rounded-xl"><Text className="font-semibold text-slate-600">Cancel</Text></Pressable>
                    </View>
                </View>
            </View>
        </Modal>
    </SafeAreaView>;
}

function StateScreen({title, detail, loading, action, onAction}: {title: string; detail?: string; loading?: boolean; action?: string; onAction?: () => void}) {
    return <SafeAreaView className="flex-1 items-center justify-center bg-[#f5f7f6] px-8"><View className="w-full rounded-3xl bg-white p-6">
        {loading && <ActivityIndicator color="#0f766e" className="mb-4"/>}<Text className="text-xl font-bold text-slate-900">{title}</Text>{detail && <Text className="mt-2 text-slate-600">{detail}</Text>}
        {action && <Pressable onPress={onAction} className="mt-5 min-h-12 items-center justify-center rounded-xl bg-teal-700"><Text className="font-semibold text-white">{action}</Text></Pressable>}
    </View></SafeAreaView>;
}
