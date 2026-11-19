import { Stack } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AuthGate from '../features/auth/AuthGate';
import "../global.css";

const queryClient = new QueryClient({
    defaultOptions: {queries: {refetchOnWindowFocus: true}},
});

export default function RootLayout() {
    return (
        <QueryClientProvider client={queryClient}>
            <AuthGate>
                <Stack>
                    <Stack.Screen name="index" options={{ headerShown: false }} />
                    <Stack.Screen name="responsibility/[childId]" options={{ headerShown: false }} />
                    <Stack.Screen name="family/join" options={{ headerShown: false }} />
                    <Stack.Screen name="account" options={{ headerShown: false }} />
                </Stack>
            </AuthGate>
        </QueryClientProvider>
    );
}
