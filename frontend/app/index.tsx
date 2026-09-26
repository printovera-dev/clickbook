import { Redirect } from "expo-router";

// The home page is public (guests can browse and sign in inline); tabs that need an account redirect to /login.
export default function Index() {
  return <Redirect href="/(tabs)/home" />;
}
