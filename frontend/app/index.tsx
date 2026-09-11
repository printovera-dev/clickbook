import { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { Redirect, useRouter } from "expo-router";
import { getToken } from "@/src/api";
import { useState } from "react";
import { colors } from "@/src/theme";

export default function Index() {
  const [state, setState] = useState<"loading" | "in" | "out">("loading");
  useEffect(() => {
    getToken().then((t) => setState(t ? "in" : "out"));
  }, []);
  if (state === "loading") {
    return (
      <View style={{ flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.brandPrimary} />
      </View>
    );
  }
  return <Redirect href={state === "in" ? "/(tabs)/home" : "/login"} />;
}
