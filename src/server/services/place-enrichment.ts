import { env } from "~/env";
import { placeEnrichments } from "~/server/db/schema";
import { fetchGooglePlaceDetails } from "~/server/lib/google-places";
import type { db as database } from "~/server/db";

type Database = typeof database;

const REQUEST_LIMIT_WINDOW_MS = 60_000;

const requestBuckets = new Map<string, { count: number; resetAt: number }>();

function assertRateLimit(userId: string) {
	const limitPerMinute =
		env.GOOGLE_PLACES_RATE_LIMIT_PER_MINUTE ??
		Number(process.env.GOOGLE_PLACES_RATE_LIMIT_PER_MINUTE ?? 60);
	const now = Date.now();
	const existing = requestBuckets.get(userId);

	if (!existing || now > existing.resetAt) {
		requestBuckets.set(userId, {
			count: 1,
			resetAt: now + REQUEST_LIMIT_WINDOW_MS,
		});
		return;
	}

	if (existing.count >= limitPerMinute) {
		throw new Error("Places rate limit exceeded. Please wait a minute.");
	}

	existing.count += 1;
}

export function sanitizeWebsiteUrl(website: string | undefined) {
	if (!website) return null;
	try {
		const normalized = /^https?:\/\//i.test(website)
			? website
			: `https://${website}`;
		const parsed = new URL(normalized);
		if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
			return null;
		}
		return parsed.toString();
	} catch {
		return null;
	}
}

export async function fetchAndPersistEnrichment({
	db,
	placeId,
	userId,
}: {
	db: Database;
	placeId: string;
	userId: string;
}) {
	const apiKey = env.GOOGLE_PLACES_API_KEY;
	if (!apiKey) {
		throw new Error("Google Places API key not configured");
	}

	assertRateLimit(userId);
	const details = await fetchGooglePlaceDetails({
		apiKey,
		placeId,
	});
	const website = sanitizeWebsiteUrl(details?.website);
	const status = details ? ("done" as const) : ("error" as const);
	const payload = {
		placeId,
		name: details?.name ?? null,
		lat: details?.location?.lat ?? null,
		lng: details?.location?.lng ?? null,
		website,
		hasWebsite: website ? true : false,
		phone: details?.phone ?? null,
		status,
		error: details ? null : "Place details not found",
		lastFetchedAt: new Date(),
		updatedAt: new Date(),
	};

	try {
		await db
			.insert(placeEnrichments)
			.values({
				...payload,
				createdAt: new Date(),
			})
			.onConflictDoUpdate({
				target: placeEnrichments.placeId,
				set: payload,
			});
	} catch (error) {
		console.warn("place-enrichment-persist-failed", {
			placeId,
			error: error instanceof Error ? error.message : "unknown",
		});
	}

	return payload;
}
