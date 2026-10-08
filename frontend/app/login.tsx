import { Redirect } from "expo-router";

// The legacy stand-alone login screen is retired: guests sign in inline on the CMS home page.
export default function Login() {
  return <Redirect href={{ pathname: "/(tabs)/home", params: { login: "1" } }} />;
}
