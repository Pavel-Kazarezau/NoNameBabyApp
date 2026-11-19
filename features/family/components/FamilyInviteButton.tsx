import {useState} from "react";
import {Alert, Pressable, Share, Text} from "react-native";
import {familyApi} from "../api/family.api";

export default function FamilyInviteButton({familyId, label = "Invite", prominent = false}: {familyId: string; label?: string; prominent?: boolean}) {
    const [busy, setBusy] = useState(false);

    const shareInvitation = async (memberRole: "CO_PARENT" | "CAREGIVER") => {
        if (busy) return;
        setBusy(true);
        try {
            const invitation = await familyApi.createInvitation(familyId, memberRole);
            await Share.share({
                message: `Join our family on BabyCare Hub as ${memberRole === "CAREGIVER" ? "a caregiver" : "a co-parent"}. Open the app, sign in, choose “Join a family” and enter this invitation code:\n\n${invitation.token}\n\nThe code expires in 7 days.`,
            }, {dialogTitle: "Invite to BabyCare Hub"});
        } catch (cause) {
            Alert.alert("Could not create invitation", cause instanceof Error ? cause.message : "Try again.");
        } finally {
            setBusy(false);
        }
    };

    return <Pressable
        accessibilityRole="button"
        disabled={busy}
        onPress={() => Alert.alert("Invite a family member", "Choose their role.", [
            {text: "Co-parent", onPress: () => void shareInvitation("CO_PARENT")},
            {text: "Caregiver", onPress: () => void shareInvitation("CAREGIVER")},
            {text: "Cancel", style: "cancel"},
        ])}
        className={`${prominent ? "min-h-12 bg-teal-700" : "min-h-10 border border-teal-200 bg-white"} items-center justify-center rounded-xl px-4 ${busy ? "opacity-60" : ""}`}
    >
        <Text className={prominent ? "font-semibold text-white" : "font-semibold text-teal-800"}>{busy ? "Creating…" : label}</Text>
    </Pressable>;
}
