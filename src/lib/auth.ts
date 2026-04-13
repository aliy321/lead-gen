import { redirect } from "next/navigation";
import { getSession } from "~/server/better-auth/server";

export async function requireAuth() {
	const session = await getSession();
	if (!session) {
		redirect("/sign-in");
	}
	return session;
}
