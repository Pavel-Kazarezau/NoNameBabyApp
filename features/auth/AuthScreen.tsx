import {useState} from "react";
import {ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View} from "react-native";
import {SafeAreaView} from "react-native-safe-area-context";
import {supabase} from "@/lib/supabase";

export default function AuthScreen() {
    const [mode, setMode] = useState<"sign_in" | "sign_up">("sign_in");
    const [displayName, setDisplayName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    const submit = async () => {
        if (loading) return;
        if (!email.trim() || !password) {
            setError("Enter your email and password.");
            return;
        }
        if (mode === "sign_up" && !displayName.trim()) {
            setError("Enter your name.");
            return;
        }
        if (mode === "sign_up" && password !== confirmPassword) {
            setError("The passwords do not match.");
            return;
        }
        setLoading(true);
        setError(null);
        setNotice(null);
        try {
            if (mode === "sign_in") {
                const {error: authError} = await supabase.auth.signInWithPassword({email: email.trim(), password});
                if (authError) setError(authError.message);
            } else {
                const {data, error: authError} = await supabase.auth.signUp({
                    email: email.trim(),
                    password,
                    options: {data: {display_name: displayName.trim()}},
                });
                if (authError) setError(authError.message);
                else if (!data.session) {
                    setMode("sign_in");
                    setNotice("Account created. Check your email to confirm it, then sign in here.");
                }
            }
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Authentication failed. Try again.");
        } finally {
            setLoading(false);
        }
    };

    return <SafeAreaView className="flex-1 bg-[#f5f7f6]" edges={["top", "bottom"]}>
        <KeyboardAvoidingView className="flex-1 justify-center px-6" behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <View className="rounded-3xl bg-white p-6 shadow-sm">
                <Text className="text-sm font-semibold uppercase tracking-widest text-teal-800">BabyCare Hub</Text>
                <Text className="mt-3 text-3xl font-bold text-slate-900">{mode === "sign_in" ? "Welcome back" : "Create your account"}</Text>
                <Text className="mt-2 text-base leading-6 text-slate-600">{mode === "sign_in" ? "Sign in to your family account." : "Register with your email and a password."}</Text>

                <Text className="mb-2 mt-6 font-semibold text-slate-800">Email</Text>
                <TextInput
                    accessibilityLabel="Email"
                    autoCapitalize="none"
                    autoComplete="email"
                    autoCorrect={false}
                    keyboardType="email-address"
                    onChangeText={setEmail}
                    onSubmitEditing={submit}
                    placeholder="you@example.com"
                    placeholderTextColor="#94a3b8"
                    returnKeyType="next"
                    textContentType="emailAddress"
                    value={email}
                    className="min-h-12 rounded-xl border border-slate-200 px-4 text-base text-slate-900"
                />
                {mode === "sign_up" && <>
                    <Text className="mb-2 mt-4 font-semibold text-slate-800">Your name</Text>
                    <TextInput
                        accessibilityLabel="Your name"
                        autoCapitalize="words"
                        autoCorrect={false}
                        maxLength={80}
                        onChangeText={setDisplayName}
                        placeholder="Your name as your family will see it"
                        placeholderTextColor="#94a3b8"
                        returnKeyType="next"
                        value={displayName}
                        className="min-h-12 rounded-xl border border-slate-200 px-4 text-base text-slate-900"
                    />
                </>}
                <Text className="mb-2 mt-4 font-semibold text-slate-800">Password</Text>
                <TextInput
                    accessibilityLabel="Password"
                    autoCapitalize="none"
                    autoComplete="password"
                    onChangeText={setPassword}
                    onSubmitEditing={submit}
                    placeholder="Your password"
                    placeholderTextColor="#94a3b8"
                    returnKeyType="go"
                    secureTextEntry
                    textContentType="password"
                    value={password}
                    className="min-h-12 rounded-xl border border-slate-200 px-4 text-base text-slate-900"
                />
                {mode === "sign_up" && <>
                    <Text className="mb-2 mt-4 font-semibold text-slate-800">Confirm password</Text>
                    <TextInput
                        accessibilityLabel="Confirm password"
                        autoCapitalize="none"
                        autoComplete="new-password"
                        onChangeText={setConfirmPassword}
                        onSubmitEditing={submit}
                        placeholder="Enter your password again"
                        placeholderTextColor="#94a3b8"
                        returnKeyType="go"
                        secureTextEntry
                        textContentType="newPassword"
                        value={confirmPassword}
                        className="min-h-12 rounded-xl border border-slate-200 px-4 text-base text-slate-900"
                    />
                </>}

                {error && <Text accessibilityRole="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-rose-800">{error}</Text>}
                {notice && <Text accessibilityRole="alert" className="mt-4 rounded-xl bg-teal-50 p-3 text-teal-900">{notice}</Text>}
                <Pressable accessibilityRole="button" disabled={loading} onPress={submit} className={`mt-6 min-h-12 flex-row items-center justify-center rounded-xl bg-teal-700 px-4 ${loading ? "opacity-60" : ""}`}>
                    {loading && <ActivityIndicator color="white" className="mr-2"/>}
                    <Text className="text-base font-semibold text-white">{loading ? "Please wait…" : mode === "sign_in" ? "Sign in" : "Create account"}</Text>
                </Pressable>
                <Pressable disabled={loading} onPress={() => {setMode(mode === "sign_in" ? "sign_up" : "sign_in"); setError(null); setNotice(null);}} className="mt-5 min-h-11 items-center justify-center">
                    <Text className="font-semibold text-teal-800">{mode === "sign_in" ? "New to BabyCare Hub? Create an account" : "Already have an account? Sign in"}</Text>
                </Pressable>
                <Text className="mt-2 text-sm leading-5 text-slate-500">{mode === "sign_in" ? "Your account must belong to a family to access children." : "After registration, create a family and add a child to continue."}</Text>
            </View>
        </KeyboardAvoidingView>
    </SafeAreaView>;
}
