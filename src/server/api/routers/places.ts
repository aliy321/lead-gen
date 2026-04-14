import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { env } from "~/env";
import { enrichmentJobs, leads, placeEnrichments } from "~/server/db/schema";
import {
	fetchGooglePlaceDetails,
	fetchPaginatedGooglePlaces,
} from "~/server/lib/google-places";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { tasks } from "@trigger.dev/sdk/v3";
import {
	fetchAndPersistEnrichment,
	sanitizeWebsiteUrl,
} from "~/server/services/place-enrichment";

const REQUEST_LIMIT_WINDOW_MS = 60_000;
const ENRICHMENT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const BACKGROUND_ENRICHMENT_BATCH_SIZE = 15;
const detailsCache = new Map<string, { expiresAt: number; value: unknown }>();
const requestBuckets = new Map<string, { count: number; resetAt: number }>();
const placeIdSchema = z.string().trim().min(5).max(255).regex(/^[A-Za-z0-9_-]+$/);
const enrichmentSessionIdSchema = z.string().trim().min(10).max(128);

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

function isFresh(lastFetchedAt: Date | null | undefined) {
	if (!lastFetchedAt) return false;
	return Date.now() - lastFetchedAt.getTime() < ENRICHMENT_TTL_MS;
}

function isMissingEnrichmentJobsTable(error: unknown) {
	const message = error instanceof Error ? error.message : String(error);
	return message.includes("no such table: lead-gen_enrichment_jobs");
}

async function scheduleBackgroundRefresh({
	db,
	placeId,
	userId,
	sessionId,
}: {
	db: typeof import("~/server/db").db;
	placeId: string;
	userId: string;
	sessionId?: string;
}) {
	if (!env.TRIGGER_SECRET_KEY) {
		void fetchAndPersistEnrichment({ db, placeId, userId })
			.then(async (result) => {
				if (!sessionId) return;
				try {
					await db
						.update(enrichmentJobs)
						.set({
							status: result.status === "error" ? "error" : "done",
							error: result.status === "error" ? result.error : null,
							updatedAt: new Date(),
						})
						.where(
							and(
								eq(enrichmentJobs.sessionId, sessionId),
								eq(enrichmentJobs.placeId, placeId),
								eq(enrichmentJobs.userId, userId),
							),
						);
				} catch (error) {
					if (!isMissingEnrichmentJobsTable(error)) {
						throw error;
					}
				}
			})
			.catch(async (error) => {
				if (sessionId) {
					try {
						await db
							.update(enrichmentJobs)
							.set({
								status: "error",
								error: error instanceof Error ? error.message : "unknown",
								updatedAt: new Date(),
							})
							.where(
								and(
									eq(enrichmentJobs.sessionId, sessionId),
									eq(enrichmentJobs.placeId, placeId),
									eq(enrichmentJobs.userId, userId),
								),
							);
					} catch (updateError) {
						if (!isMissingEnrichmentJobsTable(updateError)) {
							console.warn("place-enrichment-job-status-update-failed", {
								placeId,
								error:
									updateError instanceof Error
										? updateError.message
										: "unknown",
							});
						}
					}
				}
				console.warn("place-enrichment-refresh-fallback-failed", {
					placeId,
					error: error instanceof Error ? error.message : "unknown",
				});
			});
		return;
	}

	try {
		await tasks.trigger(
			"place-enrichment-refresh",
			{
				placeId,
				userId,
				sessionId,
			},
			{
				idempotencyKey: sessionId
					? `place-enrichment-refresh:${sessionId}:${placeId}`
					: `place-enrichment-refresh:${placeId}`,
			},
		);
	} catch (error) {
		console.warn("place-enrichment-refresh-queue-failed", {
			placeId,
			error: error instanceof Error ? error.message : "unknown",
		});
	}
}

export const placesRouter = createTRPCRouter({
	cacheByIds: protectedProcedure
		.input(
			z.object({
				placeIds: z.array(placeIdSchema).min(1).max(100),
				enrichmentSessionId: enrichmentSessionIdSchema.optional(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const uniquePlaceIds = Array.from(new Set(input.placeIds));
			let rows: Array<{
				placeId: string;
				name: string | null;
				lat: number | null;
				lng: number | null;
				website: string | null;
				hasWebsite: boolean | null;
				phone: string | null;
				status: "done" | "error";
				lastFetchedAt: Date | null;
			}> = [];
			try {
				rows = await ctx.db.query.placeEnrichments.findMany({
					where: inArray(placeEnrichments.placeId, uniquePlaceIds),
				});
			} catch (error) {
				console.warn("place-enrichment-cache-read-failed", {
					error: error instanceof Error ? error.message : "unknown",
				});
			}
			const cacheMap = Object.fromEntries(
				rows.map((row) => [
					row.placeId,
					{
						placeId: row.placeId,
						name: row.name,
						lat: row.lat,
						lng: row.lng,
						website: row.website,
						hasWebsite: row.hasWebsite,
						phone: row.phone,
						status: row.status,
						lastFetchedAt: row.lastFetchedAt,
						isFresh: isFresh(row.lastFetchedAt),
					},
				]),
			);

			// Keep client UI stable: refresh stale/missing entries asynchronously
			// instead of forcing per-item client enrichment updates.
			const toRefresh = uniquePlaceIds
				.filter((placeId) => {
					const cached = cacheMap[placeId] as
						| { isFresh?: boolean }
						| undefined;
					return !cached || cached.isFresh !== true;
				});

			let trackingSessionId = input.enrichmentSessionId;
			if (input.enrichmentSessionId) {
				const toRefreshSet = new Set(toRefresh);
				const jobRows = uniquePlaceIds.map((placeId) => ({
					sessionId: input.enrichmentSessionId as string,
					placeId,
					userId: ctx.session.user.id,
					status: toRefreshSet.has(placeId) ? ("queued" as const) : ("done" as const),
					error: null,
					createdAt: new Date(),
					updatedAt: new Date(),
				}));
				try {
					await ctx.db.insert(enrichmentJobs).values(jobRows).onConflictDoNothing();
				} catch (error) {
					if (isMissingEnrichmentJobsTable(error)) {
						trackingSessionId = undefined;
					} else {
						throw error;
					}
				}
			}
			for (const placeId of toRefresh) {
				void scheduleBackgroundRefresh({
					db: ctx.db,
					placeId,
					userId: ctx.session.user.id,
					sessionId: trackingSessionId,
				});
			}

			return {
				ttlMs: ENRICHMENT_TTL_MS,
				items: cacheMap,
			};
		}),

	enrichmentProgress: protectedProcedure
		.input(
			z.object({
				sessionId: enrichmentSessionIdSchema,
			}),
		)
		.query(async ({ ctx, input }) => {
			let rows: Array<{ status: "queued" | "running" | "done" | "error" }> = [];
			try {
				rows = await ctx.db.query.enrichmentJobs.findMany({
					where: and(
						eq(enrichmentJobs.sessionId, input.sessionId),
						eq(enrichmentJobs.userId, ctx.session.user.id),
					),
				});
			} catch (error) {
				if (!isMissingEnrichmentJobsTable(error)) {
					throw error;
				}
			}

			const total = rows.length;
			const pending = rows.filter(
				(row) => row.status === "queued" || row.status === "running",
			).length;
			const done = rows.filter((row) => row.status === "done").length;
			const errored = rows.filter((row) => row.status === "error").length;

			return {
				total,
				pending,
				done,
				errored,
			};
		}),

	enrich: protectedProcedure
		.input(
			z.object({
				placeId: placeIdSchema,
				force: z.boolean().default(false),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			let existing:
				| {
						placeId: string;
						name: string | null;
						lat: number | null;
						lng: number | null;
						website: string | null;
						hasWebsite: boolean | null;
						phone: string | null;
						status: "done" | "error";
						lastFetchedAt: Date | null;
				  }
				| undefined;
			try {
				existing = await ctx.db.query.placeEnrichments.findFirst({
					where: eq(placeEnrichments.placeId, input.placeId),
				});
			} catch (error) {
				console.warn("place-enrichment-existing-read-failed", {
					placeId: input.placeId,
					error: error instanceof Error ? error.message : "unknown",
				});
			}
			if (existing && isFresh(existing.lastFetchedAt) && !input.force) {
				return {
					placeId: existing.placeId,
					name: existing.name,
					lat: existing.lat,
					lng: existing.lng,
					website: existing.website,
					hasWebsite: existing.hasWebsite,
					phone: existing.phone,
					status: existing.status,
					lastFetchedAt: existing.lastFetchedAt,
					isFresh: true,
					source: "cache" as const,
				};
			}

			if (existing && !isFresh(existing.lastFetchedAt) && !input.force) {
				void scheduleBackgroundRefresh({
					db: ctx.db,
					placeId: input.placeId,
					userId: ctx.session.user.id,
				});
				return {
					placeId: existing.placeId,
					name: existing.name,
					lat: existing.lat,
					lng: existing.lng,
					website: existing.website,
					hasWebsite: existing.hasWebsite,
					phone: existing.phone,
					status: existing.status,
					lastFetchedAt: existing.lastFetchedAt,
					isFresh: false,
					source: "stale" as const,
				};
			}

			const refreshed = await fetchAndPersistEnrichment({
				db: ctx.db,
				placeId: input.placeId,
				userId: ctx.session.user.id,
			});
			return {
				...refreshed,
				isFresh: true,
				source: "refreshed" as const,
			};
		}),

	enrichedMarkers: protectedProcedure.query(async ({ ctx }) => {
		const rows = await ctx.db.query.placeEnrichments.findMany({
			where: inArray(placeEnrichments.status, ["done", "error"]),
		});
		const rowByPlaceId = new Map(rows.map((row) => [row.placeId, row]));
		const markersByPlaceId = new Map<
			string,
			{
				placeId: string;
				name: string;
				lat: number;
				lng: number;
				status: "done" | "error";
				website: string | null;
				phone: string | null;
				hasWebsite: boolean | null;
			}
		>();

		for (const row of rows) {
			if (typeof row.lat !== "number" || typeof row.lng !== "number") continue;
			markersByPlaceId.set(row.placeId, {
				placeId: row.placeId,
				name: row.name ?? row.placeId,
				lat: row.lat,
				lng: row.lng,
				status: row.status,
				website: row.website,
				phone: row.phone,
				hasWebsite: row.hasWebsite,
			});
		}

		const missingCoordPlaceIds = rows
			.filter((row) => typeof row.lat !== "number" || typeof row.lng !== "number")
			.map((row) => row.placeId);

		if (missingCoordPlaceIds.length > 0) {
			// Backfill from known saved-lead coordinates first for immediate map visibility.
			const leadRows = await ctx.db.query.leads.findMany({
				where: and(
					inArray(leads.placeId, missingCoordPlaceIds),
					isNotNull(leads.lat),
					isNotNull(leads.lng),
				),
			});

			for (const lead of leadRows) {
				if (markersByPlaceId.has(lead.placeId)) continue;
				const enrichment = rowByPlaceId.get(lead.placeId);
				if (!enrichment) continue;
				if (typeof lead.lat !== "number" || typeof lead.lng !== "number") continue;
				markersByPlaceId.set(lead.placeId, {
					placeId: lead.placeId,
					name: enrichment.name ?? lead.name ?? lead.placeId,
					lat: lead.lat,
					lng: lead.lng,
					status: enrichment.status,
					website: enrichment.website,
					phone: enrichment.phone,
					hasWebsite: enrichment.hasWebsite,
				});
			}

			// Then schedule a small background refresh to persist missing coordinates in enrichment rows.
			for (const placeId of missingCoordPlaceIds.slice(0, BACKGROUND_ENRICHMENT_BATCH_SIZE)) {
				void scheduleBackgroundRefresh({
					db: ctx.db,
					placeId,
					userId: ctx.session.user.id,
				});
			}
		}

		return Array.from(markersByPlaceId.values());
	}),

	search: protectedProcedure
		.input(
			z.object({
				query: z.string(),
				type: z.string().optional(),
				limit: z.number().int().min(10).max(50).default(30),
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
				limit: z.number().int().min(10).max(50).default(30),
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
		.input(z.object({ placeId: placeIdSchema }))
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
			const website = sanitizeWebsiteUrl(details?.website);
			try {
				if (details) {
					await ctx.db
						.insert(placeEnrichments)
						.values({
							placeId: input.placeId,
							name: details.name,
							lat: details.location?.lat ?? null,
							lng: details.location?.lng ?? null,
							website,
							hasWebsite: website ? true : false,
							phone: details.phone ?? null,
							status: "done",
							error: null,
							lastFetchedAt: new Date(),
							createdAt: new Date(),
							updatedAt: new Date(),
						})
						.onConflictDoUpdate({
							target: placeEnrichments.placeId,
							set: {
								name: details.name,
								lat: details.location?.lat ?? null,
								lng: details.location?.lng ?? null,
								website,
								hasWebsite: website ? true : false,
								phone: details.phone ?? null,
								status: "done",
								error: null,
								lastFetchedAt: new Date(),
								updatedAt: new Date(),
							},
						});
				} else {
					await ctx.db
						.insert(placeEnrichments)
						.values({
							placeId: input.placeId,
							website: null,
							hasWebsite: null,
							phone: null,
							status: "error",
							error: "Place details not found",
							lastFetchedAt: new Date(),
							createdAt: new Date(),
							updatedAt: new Date(),
						})
						.onConflictDoUpdate({
							target: placeEnrichments.placeId,
							set: {
								status: "error",
								error: "Place details not found",
								lastFetchedAt: new Date(),
								updatedAt: new Date(),
							},
						});
				}
			} catch (error) {
				console.warn("place-enrichment-details-persist-failed", {
					placeId: input.placeId,
					error: error instanceof Error ? error.message : "unknown",
				});
			}

			detailsCache.set(input.placeId, {
				value: details,
				expiresAt: now + 10 * 60_000,
			});

			return details;
		}),
});
