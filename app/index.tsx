
import { View, Text } from "react-native";

export default function Index() {
    return (
        <View className="flex-1 items-center justify-center bg-slate-100">
            <View className="rounded-2xl bg-white p-8 shadow-lg">
                <Text className="text-2xl font-bold text-blue-600">
                    BabyCare Hub
                </Text>

                <Text className="mt-2 text-base text-gray-500">
                    NativeWind is working!
                </Text>
            </View>
        </View>
    );
}
