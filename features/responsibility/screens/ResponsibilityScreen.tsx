import DateTimePicker, {type DateTimePickerEvent} from "@react-native-community/datetimepicker";
import {useLocalSearchParams, router} from "expo-router";
import {useEffect, useState} from "react";
import {ActivityIndicator, Alert, Modal, Pressable, RefreshControl, ScrollView, Text, View} from "react-native";
import {SafeAreaView} from "react-native-safe-area-context";
import {supabase} from "@/lib/supabase";
import CreateFamilyScreen from "@/features/family/screens/CreateFamilyScreen";
import {useResponsibilityActions} from "../hooks/useResponsibilityMutations";
import {useResponsibilityChildren, useResponsibilityMembers, useResponsibilitySnapshot} from "../hooks/useResponsibilitySnapshot";
import type {FamilyMemberRole, ResponsibilityChild, ResponsibilityMember} from "../api/responsibility.types";

const labels: Record<string, string> = {
    PRIMARY_PARENT: "Parent", CO_PARENT: "Co-parent", CAREGIVER: "Caregiver",
};
let realtimeChannelSequence = 0;
const roleName = (role?: FamilyMemberRole | string | null) => role ? labels[role] ?? "Family member" : "Family member";
const formatTime = (value: string) => new Intl.DateTimeFormat(undefined, {dateStyle: "medium", timeStyle: "short"}).format(new Date(value));
const memberLabel = (member: ResponsibilityMember | undefined) => member
    ? member.display_name?.trim() || `${roleName(member.role)} · ${member.id.slice(0, 8)}`
    : "Family member";

export default function ResponsibilityScreen() {
    const {childId: routeChildId} = useLocalSearchParams<{childId?: string}>();
    const children = useResponsibilityChildren();
    const selectedChildId = routeChildId ?? children.data?.[0]?.id ?? "";
    const child = children.data?.find((entry) => entry.id === selectedChildId);
    const snapshotQuery = useResponsibilitySnapshot(selectedChildId);
    const snapshot = snapshotQuery.data;
    const membersQuery = useResponsibilityMembers(child?.family_id ?? "");
    const members = membersQuery.data ?? [];
    const otherMembers = members.filter((member) => member.id !== snapshotQuery.data?.current_user_member_id);
    const actions = useResponsibilityActions(selectedChildId);
    const [now, setNow] = useState(0);
    const [planOpen, setPlanOpen] = useState(false);
    const [picker, setPicker] = useState<"start" | "end" | null>(null);
    const [planMember, setPlanMember] = useState("");
    const [planStart, setPlanStart] = useState(() => new Date(Date.now() + 60 * 60_000));
    const [planEnd, setPlanEnd] = useState(() => new Date(Date.now() + 3 * 60 * 60_000));
    const busy = Object.values(actions).some((mutation) => mutation.isPending);
    const mutationError = Object.values(actions).find((mutation) => mutation.error)?.error;

    useEffect(() => {
        if (!routeChildId && children.data?.[0]) router.replace(`/responsibility/${children.data[0].id}`);
    }, [children.data, routeChildId]);
    useEffect(() => {
        const initial = setTimeout(() => setNow(Date.now()), 0);
        const timer = setInterval(() => setNow(Date.now()), 60_000);
        return () => { clearTimeout(initial); clearInterval(timer); };
    }, []);
    const refetchSnapshot = snapshotQuery.refetch;
    useEffect(() => {
        if (!selectedChildId) return;
        // Supabase reuses an existing channel when the topic name matches.
        // A rapid remount can therefore return an already-subscribed channel
        // before the previous effect's asynchronous cleanup has completed.
        const channel = supabase.channel(`responsibility-${selectedChildId}-${++realtimeChannelSequence}`);
        channel
            .on("postgres_changes", {event: "*", schema: "public", table: "responsibilities", filter: `child_id=eq.${selectedChildId}`}, () => { void refetchSnapshot(); })
            .on("postgres_changes", {event: "*", schema: "public", table: "responsibility_plans", filter: `child_id=eq.${selectedChildId}`}, () => { void refetchSnapshot(); })
            .on("postgres_changes", {event: "*", schema: "public", table: "handovers", filter: `child_id=eq.${selectedChildId}`}, () => { void refetchSnapshot(); });
        channel.subscribe();
        return () => { void supabase.removeChannel(channel); };
    }, [selectedChildId, refetchSnapshot]);

    const currentResponsible = members.find((member) => member.id === snapshot?.responsibility?.current_responsible_id);
    const planResponsible = members.find((member) => member.id === snapshot?.next_plan?.responsible_id);
    const pendingPlanMember = members.find((member) => member.id === snapshot?.pending_plan?.responsible_id);
    const incomingHandover = snapshot?.pending_handover?.to_parent_id === snapshot?.current_user_member_id;
    const incomingPlan = snapshot?.pending_plan?.responsible_id === snapshot?.current_user_member_id;
    const hasPlans = Boolean(snapshot?.next_plan || snapshot?.pending_plan);
    const hasOpenCoordination = Boolean(snapshot?.pending_handover || snapshot?.pending_plan || snapshot?.next_plan);
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
        {text: "Cancel", style: "cancel"}, {text: "Continue", onPress: operation},
    ]);
    const submitPlan = () => {
        if (!planMember || planEnd <= planStart) {
            Alert.alert("Check the plan", "Choose a participant and an end time after the start time.");
            return;
        }
        actions.createPlan.mutate({memberId: planMember, start: planStart.toISOString(), end: planEnd.toISOString()}, {onSuccess: () => setPlanOpen(false)});
    };
    const onDateChange = (event: DateTimePickerEvent, date?: Date) => {
        if (event.type === "dismissed") { setPicker(null); return; }
        if (date && picker === "start") setPlanStart(date);
        if (date && picker === "end") setPlanEnd(date);
        setPicker(null);
    };
    if (children.isLoading) return <StateScreen title="Loading your family…" loading />;
    if (children.isError) return <StateScreen title="Could not load children" detail={children.error.message} action="Try again" onAction={() => void children.refetch()} />;
    if (!children.data?.length) return <CreateFamilyScreen />;
    if (!selectedChildId || !child) return <StateScreen title="Loading responsibility…" loading />;
    if (snapshotQuery.isLoading) return <StateScreen title={`Responsibility for ${child.name}`} loading />;
    if (snapshotQuery.isError) return <StateScreen title="Could not load responsibility" detail={snapshotQuery.error.message} action="Try again" onAction={() => void snapshotQuery.refetch()} />;
    if (!snapshot) return <StateScreen title="No responsibility data" detail="The server did not return a responsibility snapshot." />;

    const showAction = (text: string, onPress: () => void, secondary = false) => (
        <Pressable accessibilityRole="button" disabled={busy} onPress={onPress} className={`min-h-12 items-center justify-center rounded-xl px-4 py-3 ${secondary ? "border border-slate-200 bg-white" : "bg-teal-700"} ${busy ? "opacity-50" : ""}`}>
            <Text className={`text-base font-semibold ${secondary ? "text-slate-800" : "text-white"}`}>{text}</Text>
        </Pressable>
    );
    const actionError = mutationError instanceof Error ? mutationError.message : null;

    return <SafeAreaView className="flex-1 bg-[#f5f7f6]" edges={["top", "left", "right"]}>
        <ScrollView className="flex-1" contentContainerClassName="px-5 pb-10 pt-3" refreshControl={<RefreshControl refreshing={snapshotQuery.isRefetching} onRefresh={() => void snapshotQuery.refetch()} />}>
            <View className="mb-5 flex-row items-center justify-between">
                <View><Text className="text-sm font-medium uppercase tracking-widest text-teal-800">BabyCare Hub</Text><Text className="mt-1 text-3xl font-bold text-slate-900">Responsibility</Text></View>
                <View className="items-end gap-2">
                    <View className="flex-row gap-2">
                        {children.data.length > 1 && <Pressable onPress={() => Alert.alert("Choose a child", undefined, [...children.data!.map((item: ResponsibilityChild) => ({text: item.name, onPress: () => { router.replace(`/responsibility/${item.id}`); }})), {text: "Cancel", style: "cancel" as const}])} className="rounded-xl border border-slate-200 bg-white px-3 py-2"><Text className="font-semibold text-slate-700">{child.name}⌄</Text></Pressable>}
                    </View>
                    <Pressable accessibilityRole="button" onPress={() => router.push("/account")} className="px-2 py-1"><Text className="text-sm font-medium text-slate-600">Account</Text></Pressable>
                </View>
            </View>
            <View className="rounded-3xl bg-white p-5 shadow-sm">
                <Text className="text-sm font-semibold uppercase tracking-wide text-slate-500">Right now</Text>
                <Text className="mt-2 text-2xl font-bold text-slate-900">{child.name}</Text>
                {snapshot.responsibility ? <>
                    <View className="mt-4 rounded-2xl bg-teal-50 p-4">
                        <Text className="text-xl font-bold text-teal-950">{snapshot.responsibility.current_responsible_id === snapshot.current_user_member_id ? "You are responsible" : `${memberLabel(currentResponsible)} is responsible`}</Text>
                        <Text className="mt-1 text-slate-700">{duration} so far · since {formatTime(snapshot.responsibility.started_at)}</Text>
                    </View>
                    {snapshot.responsibility.current_responsible_id === snapshot.current_user_member_id && <Text className="mt-3 text-slate-600">You can take a moment to rest.</Text>}
                </> : <Text className="mt-3 text-slate-600">No current responsibility is recorded. You can take responsibility now.</Text>}
                {isSoleMember ? <View className="mt-4 rounded-2xl bg-slate-50 p-4">
                    <Text className="font-semibold text-slate-800">You’re the only family member</Text>
                    <Text className="mt-1 leading-5 text-slate-600">Handover and shared-care planning become available when another family member joins.</Text>
                </View> : membersQuery.isLoading ? <View className="mt-4 flex-row items-center gap-2"><ActivityIndicator color="#0f766e"/><Text className="text-slate-500">Loading family members…</Text></View> : otherMembers.length > 0 && <View className="mt-4 gap-3">
                    {!isCurrentUserResponsible && !snapshot.pending_handover && !snapshot.pending_plan && showAction("Take responsibility now", () => confirm("Take responsibility?", "This will record you as responsible now.", () => actions.take.mutate(undefined)), true)}
                    {!hasOpenCoordination && showAction("Request handover", () => {
                        const options = otherMembers.map((member) => ({text: memberLabel(member), onPress: () => actions.handover.mutate(member.id)}));
                        Alert.alert("Request handover", "Choose who you would like to take responsibility next.", [...options, {text: "Cancel", style: "cancel" as const}]);
                    }, true)}
                    {!hasOpenCoordination && showAction("Create a plan", () => { setPlanMember(otherMembers[0].id); setPlanOpen(true); })}
                    {hasOpenCoordination && <Text className="text-sm leading-5 text-slate-500">Finish or cancel the current request or plan before starting another.</Text>}
                </View>}
                {membersQuery.isSuccess && members.length === 0 && <Text className="mt-4 text-sm leading-5 text-amber-800">No active family members were found. Refresh the screen or check your family membership.</Text>}
            </View>

            <View className="mt-5 rounded-3xl bg-white p-5">
                <Text className="text-lg font-bold text-slate-900">Planned responsibility</Text>
                {snapshot.next_plan ? <View className="mt-3 rounded-2xl bg-amber-50 p-4">
                    <Text className="font-semibold text-slate-900">{memberLabel(planResponsible)} · {snapshot.next_plan.status.replaceAll("_", " ")}</Text>
                    <Text className="mt-1 text-slate-700">{formatTime(snapshot.next_plan.planned_start_at)} – {formatTime(snapshot.next_plan.planned_end_at)}</Text>
                    {snapshot.next_plan.status === "SCHEDULED" && <Text className="mt-2 text-amber-900">Once accepted, this plan switches responsibility automatically at the start time and returns it at the end time.</Text>}
                    {snapshot.next_plan.created_by === snapshot.current_user_member_id && showAction("Cancel plan", () => confirm("Cancel plan?", "This will cancel your planned responsibility.", () => actions.cancelPlan.mutate(snapshot.next_plan!.id)), true)}
                </View> : <Text className="mt-2 text-slate-600">No upcoming agreed plan.</Text>}
                {snapshot.planned_relief_window && <Text className="mt-3 text-sm text-slate-500">Planned handover window: {formatTime(snapshot.planned_relief_window.starts_at)} – {formatTime(snapshot.planned_relief_window.ends_at)}. This does not transfer responsibility automatically.</Text>}
                {!hasPlans && <Text className="mt-1 text-xs text-slate-400">This view shows the next plan only.</Text>}
            </View>

            {(snapshot.pending_handover || snapshot.pending_plan) && <View className="mt-5 rounded-3xl bg-white p-5">
                <Text className="text-lg font-bold text-slate-900">Requests</Text>
                {snapshot.pending_handover && <View className="mt-3 rounded-2xl border border-slate-200 p-4">
                    <Text className="font-semibold text-slate-900">{incomingHandover ? "Handover request for you" : "Handover request pending"}</Text>
                    <Text className="mt-1 text-slate-600">Requested {formatTime(snapshot.pending_handover.requested_at)} · {snapshot.pending_handover.type.toLowerCase()}</Text>
                    {incomingHandover ? <View className="mt-3 gap-2">
                        {showAction("Accept handover", () => confirm("Accept responsibility?", "This records the handover as completed now.", () => actions.acceptHandover.mutate(snapshot.pending_handover!.id)))}
                        {showAction("Decline request", () => confirm("Decline request?", "The request will be declined.", () => actions.declineHandover.mutate(snapshot.pending_handover!.id)), true)}
                    </View> : snapshot.pending_handover.initiated_by === snapshot.current_user_member_id && showAction("Cancel request", () => actions.cancelHandover.mutate(snapshot.pending_handover!.id), true)}
                </View>}
                {snapshot.pending_plan && <View className="mt-3 rounded-2xl border border-slate-200 p-4">
                    <Text className="font-semibold text-slate-900">{incomingPlan ? "Plan awaiting your approval" : "Plan awaiting approval"}</Text>
                    <Text className="mt-1 text-slate-600">{memberLabel(pendingPlanMember)} · {formatTime(snapshot.pending_plan.planned_start_at)} – {formatTime(snapshot.pending_plan.planned_end_at)}</Text>
                    {incomingPlan ? <View className="mt-3 gap-2">
                        {showAction("Accept plan", () => actions.acceptPlan.mutate(snapshot.pending_plan!.id))}
                        {showAction("Decline plan", () => confirm("Decline plan?", "The plan will be declined.", () => actions.declinePlan.mutate(snapshot.pending_plan!.id)), true)}
                    </View> : snapshot.pending_plan.created_by === snapshot.current_user_member_id && showAction("Cancel plan request", () => actions.cancelPlan.mutate(snapshot.pending_plan!.id), true)}
                </View>}
            </View>}
            {membersQuery.isError && <Text className="mt-4 text-sm text-rose-700">Could not load family participants: {membersQuery.error.message}</Text>}
            {actionError && <View accessibilityRole="alert" className="mt-4 rounded-xl bg-rose-50 p-4"><Text className="font-semibold text-rose-900">Action failed</Text><Text className="mt-1 text-rose-800">{actionError}</Text></View>}
            {busy && <View className="mt-3 flex-row items-center gap-2"><ActivityIndicator color="#0f766e"/><Text className="text-slate-600">Updating responsibility…</Text></View>}
        </ScrollView>

        <Modal visible={planOpen} animationType="slide" transparent onRequestClose={() => setPlanOpen(false)}>
            <View className="flex-1 justify-end bg-black/30"><View className="rounded-t-3xl bg-white px-5 pb-8 pt-5">
                <Text className="text-xl font-bold text-slate-900">Create responsibility plan</Text>
                <Text className="mt-1 text-slate-600">A plan does not change who is responsible until it is accepted.</Text>
                <Text className="mb-2 mt-5 font-semibold text-slate-800">Responsible participant</Text>
                <ScrollView horizontal className="max-h-12" contentContainerClassName="gap-2">
                    {members.filter((member) => member.id !== snapshot.current_user_member_id).map((member) => <Pressable key={member.id} onPress={() => setPlanMember(member.id)} className={`rounded-xl px-4 py-3 ${planMember === member.id ? "bg-teal-700" : "bg-slate-100"}`}><Text className={planMember === member.id ? "font-semibold text-white" : "text-slate-800"}>{memberLabel(member)}</Text></Pressable>)}
                </ScrollView>
                <Pressable onPress={() => setPicker("start")} className="mt-4 rounded-xl bg-slate-100 p-4"><Text className="text-slate-500">Starts</Text><Text className="mt-1 font-semibold text-slate-900">{formatTime(planStart.toISOString())}</Text></Pressable>
                <Pressable onPress={() => setPicker("end")} className="mt-3 rounded-xl bg-slate-100 p-4"><Text className="text-slate-500">Ends</Text><Text className="mt-1 font-semibold text-slate-900">{formatTime(planEnd.toISOString())}</Text></Pressable>
                {picker && <DateTimePicker value={picker === "start" ? planStart : planEnd} mode="datetime" minimumDate={new Date()} onChange={onDateChange} />}
                <View className="mt-5 gap-3">{showAction("Save plan", submitPlan)}{showAction("Cancel", () => setPlanOpen(false), true)}</View>
            </View></View>
        </Modal>
    </SafeAreaView>;
}

function StateScreen({title, detail, loading, action, onAction}: {title: string; detail?: string; loading?: boolean; action?: string; onAction?: () => void}) {
    return <SafeAreaView className="flex-1 items-center justify-center bg-[#f5f7f6] px-8"><View className="w-full rounded-3xl bg-white p-6">
        {loading && <ActivityIndicator color="#0f766e" className="mb-4"/>}<Text className="text-xl font-bold text-slate-900">{title}</Text>{detail && <Text className="mt-2 text-slate-600">{detail}</Text>}
        {action && <Pressable onPress={onAction} className="mt-5 min-h-12 items-center justify-center rounded-xl bg-teal-700"><Text className="font-semibold text-white">{action}</Text></Pressable>}
    </View></SafeAreaView>;
}
