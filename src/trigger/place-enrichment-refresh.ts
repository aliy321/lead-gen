import { logger, task } from "@trigger.dev/sdk/v3";
import { db } from "~/server/db";
import { enrichmentJobs } from "~/server/db/schema";
import { fetchAndPersistEnrichment } from "~/server/services/place-enrichment";
import { and, eq } from "drizzle-orm";

function isMissingEnrichmentJobsTable(error: unknown) {
	const message = error instanceof Error ? error.message : String(error);
	return message.includes("no such table: lead-gen_enrichment_jobs");
}

export const placeEnrichmentRefreshTask = task({
	id: "place-enrichment-refresh",
	run: async (payload: { placeId: string; userId: string; sessionId?: string }) => {
		if (payload.sessionId) {
			try {
				await db
					.update(enrichmentJobs)
					.set({
						status: "running",
						error: null,
						updatedAt: new Date(),
					})
					.where(
						and(
							eq(enrichmentJobs.sessionId, payload.sessionId),
							eq(enrichmentJobs.placeId, payload.placeId),
							eq(enrichmentJobs.userId, payload.userId),
						),
					);
			} catch (error) {
				if (!isMissingEnrichmentJobsTable(error)) {
					throw error;
				}
			}
		}

		try {
			const result = await fetchAndPersistEnrichment({
				db,
				placeId: payload.placeId,
				userId: payload.userId,
			});

			if (payload.sessionId) {
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
								eq(enrichmentJobs.sessionId, payload.sessionId),
								eq(enrichmentJobs.placeId, payload.placeId),
								eq(enrichmentJobs.userId, payload.userId),
							),
						);
				} catch (error) {
					if (!isMissingEnrichmentJobsTable(error)) {
						throw error;
					}
				}
			}

			logger.log("Place enrichment refreshed", {
				placeId: payload.placeId,
				status: result.status,
				sessionId: payload.sessionId,
			});

			return result;
		} catch (error) {
			if (payload.sessionId) {
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
								eq(enrichmentJobs.sessionId, payload.sessionId),
								eq(enrichmentJobs.placeId, payload.placeId),
								eq(enrichmentJobs.userId, payload.userId),
							),
						);
				} catch (updateError) {
					if (!isMissingEnrichmentJobsTable(updateError)) {
						throw updateError;
					}
				}
			}
			throw error;
		}
	},
});
