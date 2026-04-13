export function resolveBaseUrl(explicitBaseUrl?: string) {
	if (explicitBaseUrl) return explicitBaseUrl;
	if (typeof window !== "undefined") return window.location.origin;
	if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
	return `http://localhost:${process.env.PORT ?? 3000}`;
}

export function getBaseUrl() {
	return resolveBaseUrl();
}

export function getTrustedOrigins(baseUrl: string) {
	return Array.from(
		new Set([baseUrl, "http://localhost:3000", "http://localhost:3001"]),
	);
}
