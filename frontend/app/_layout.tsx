import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { LogBox, View, Image, Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { useFonts } from "expo-font";
import { FONT_ASSETS } from "@/src/design";

import { ErrorBoundary } from "@/src/components/error-boundary";
import { queryClient } from "@/src/query-client";

LogBox.ignoreAllLogs(true);

// Preserve icon prewarm logic for expo go android
const iconPrewarm = () => {
  if (Platform.OS !== "web") {
    try {
      const iconModules = [
        require("@react-native-vector-icons/feather"),
      ];
      iconModules.forEach(() => {});
    } catch {}
  }
};

export default function RootLayout() {
  useFonts(FONT_ASSETS); // design fonts; screens render with fallbacks until loaded
  useEffect(() => {
    iconPrewarm();
  }, []);
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ErrorBoundary>
          <QueryClientProvider client={queryClient}>
            <StatusBar style="dark" />
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#FAFAF8" } }} />
          </QueryClientProvider>
        </ErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
