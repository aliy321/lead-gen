import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { env } from "~/env";
import {
	fetchGooglePlaceDetails,
	fetchPaginatedGooglePlaces,
} from "~/server/lib/google-places";

const REQUEST_LIMIT_WINDOW_MS = 60_000;
const detailsCache = new Map<string, { expiresAt: number; value: unknown }>();
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

export const placesRouter = createTRPCRouter({
	search: protectedProcedure
		.input(
			z.object({
				query: z.string(),
				type: z.string().optional(),
				limit: z.number().int().min(10).max(30).default(20),
			}),
		)
		.query(async ({ ctx, input }) => {
			const apiKey = env.GOOGLE_PLACES_API_KEY;
			if (!apiKey) {
				throw new Error("Google Places API key not configured");
			}
			assertRateLimit(ctx.session.user.id);

			// Build search query - support niche + area + Singapore
			let searchQuery = input.query;
			if (!searchQuery.toLowerCase().includes("singapore")) {
				searchQuery += " Singapore";
			}

			const params = new URLSearchParams({
				query: searchQuery,
				key: apiKey,
			});

			if (input.type) {
				params.set("type", input.type);
			}

			return fetchPaginatedGooglePlaces({
				url: "https://maps.googleapis.com/maps/api/place/textsearch/json",
				firstPageParams: params,
				limit: input.limit,
			});
		}),

	nearby: protectedProcedure
		.input(
			z.object({
				lat: z.number(),
				lng: z.number(),
				radius: z.number().default(5000),
				type: z.string().optional(),
				limit: z.number().int().min(10).max(30).default(20),
			}),
		)
		.query(async ({ ctx, input }) => {
			const apiKey = env.GOOGLE_PLACES_API_KEY;
			if (!apiKey) {
				throw new Error("Google Places API key not configured");
			}
			assertRateLimit(ctx.session.user.id);

			const params = new URLSearchParams({
				location: `${input.lat},${input.lng}`,
				radius: input.radius.toString(),
				key: apiKey,
			});

			if (input.type) {
				params.set("type", input.type);
			}

			return fetchPaginatedGooglePlaces({
				url: "https://maps.googleapis.com/maps/api/place/nearbysearch/json",
				firstPageParams: params,
				limit: input.limit,
			});
		}),

	// Get place details for scoring
	details: protectedProcedure
		.input(z.object({ placeId: z.string() }))
		.query(async ({ ctx, input }) => {
			const apiKey = env.GOOGLE_PLACES_API_KEY;
			if (!apiKey) {
				throw new Error("Google Places API key not configured");
			}
			assertRateLimit(ctx.session.user.id);

			const cached = detailsCache.get(input.placeId);
			const now = Date.now();
			if (cached && cached.expiresAt > now) {
				return cached.value;
			}

			const details = await fetchGooglePlaceDetails({
				apiKey,
				placeId: input.placeId,
			});

			detailsCache.set(input.placeId, {
				value: details,
				expiresAt: now + 10 * 60_000,
			});

			return details;
		}),
});
