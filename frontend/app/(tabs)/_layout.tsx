import { useEffect, useState } from "react";
import { Tabs, useRouter } from "expo-router";
import Feather from "@react-native-vector-icons/feather";
import { Platform } from "react-native";
import { getToken } from "@/src/api";
import { colors, fonts } from "@/src/theme";

export default function TabsLayout() {
  const router = useRouter();
  const [authed, setAuthed] = useState<boolean | null>(null);
  useEffect(() => { getToken().then((t) => setAuthed(!!t)); }, []);

  // Home is public; the other tabs need a signed-in customer → send guests to the existing login flow.
  const guard = { tabPress: (e: any) => { if (authed === false) { e.preventDefault(); router.push("/login"); } } };

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.homePink,
        tabBarInactiveTintColor: colors.onSurfaceInverse,
        tabBarStyle: {
          backgroundColor: colors.homeCharcoal,
          borderTopColor: colors.homeCharcoal,
          ...(Platform.OS === "web" ? { height: 64 } : {}),
        },
        tabBarItemStyle: { alignSelf: "center" },
        tabBarLabelStyle: { fontFamily: fonts.text, fontSize: 11 },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{ title: "Home", tabBarIcon: ({ color, size }) => <Feather name="home" color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="chat"
        listeners={guard}
        options={{ title: "Chat", tabBarIcon: ({ color, size }) => <Feather name="message-circle" color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="orders"
        listeners={guard}
        options={{ title: "Orders", tabBarIcon: ({ color, size }) => <Feather name="shopping-cart" color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="profile"
        listeners={guard}
        options={{ title: "Profile", tabBarIcon: ({ color, size }) => <Feather name="user" color={color} size={size} /> }}
      />
      {/* My Books stays reachable (Home → "See all", Profile) but is not a bottom tab */}
      <Tabs.Screen name="albums" listeners={guard} options={{ href: null, title: "My ClickBooks" }} />
    </Tabs>
  );
}
