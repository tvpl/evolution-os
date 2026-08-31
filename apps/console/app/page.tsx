import { redirect } from "next/navigation";
import { sessionToken } from "./lib/hub";

export default async function Home() {
  const token = await sessionToken();
  redirect(token ? "/w/current/projects" : "/login");
}
