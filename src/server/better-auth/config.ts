import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

import { env } from "~/env";
import { getTrustedOrigins, resolveBaseUrl } from "~/lib/get-base-url";
import { db } from "~/server/db";

const authBaseUrl = resolveBaseUrl(env.BETTER_AUTH_URL);
const trustedOrigins = getTrustedOrigins(authBaseUrl);

export const auth = betterAuth({
	appName: "Lead Gen",
	baseURL: authBaseUrl,
	trustedOrigins,
	database: drizzleAdapter(db, {
		provider: "sqlite",
	}),
	emailAndPassword: {
		enabled: true,
	},
	account: {
		skipStateCookieCheck: true,
	},
	socialProviders: {
		google: {
			clientId: env.BETTER_AUTH_GOOGLE_CLIENT_ID ?? "",
			clientSecret: env.BETTER_AUTH_GOOGLE_CLIENT_SECRET ?? "",
			redirectURI: `${authBaseUrl}/api/auth/callback/google`,
		},
	},
});

export type Session = typeof auth.$Infer.Session;
