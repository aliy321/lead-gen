import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const enrichmentJobStatusEnum = [
	"queued",
	"running",
	"done",
	"error",
] as const;

export type EnrichmentJobStatus = (typeof enrichmentJobStatusEnum)[number];

export const enrichmentJobs = sqliteTable(
	"lead-gen_enrichment_jobs",
	(d) => ({
		id: text()
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		sessionId: text().notNull(),
		placeId: text().notNull(),
		userId: text().notNull(),
		status: text({ enum: enrichmentJobStatusEnum }).notNull().default("queued"),
		error: text(),
		createdAt: integer({ mode: "timestamp" }).$defaultFn(() => new Date()),
		updatedAt: integer({ mode: "timestamp" }).$onUpdate(() => new Date()),
	}),
	(table) => [
		uniqueIndex("enrichment_jobs_session_place_unique_idx").on(
			table.sessionId,
			table.placeId,
		),
		index("enrichment_jobs_session_idx").on(table.sessionId),
		index("enrichment_jobs_user_idx").on(table.userId),
		index("enrichment_jobs_status_idx").on(table.status),
	],
);
