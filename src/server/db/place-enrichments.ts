import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const placeEnrichmentStatusEnum = ["done", "error"] as const;
export type PlaceEnrichmentStatus = (typeof placeEnrichmentStatusEnum)[number];

export const placeEnrichments = sqliteTable(
	"lead-gen_place_enrichments",
	(d) => ({
		id: text()
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		placeId: text().notNull(),
		name: text(),
		lat: real(),
		lng: real(),
		website: text(),
		hasWebsite: integer({ mode: "boolean" }),
		phone: text(),
		status: text({ enum: placeEnrichmentStatusEnum }).notNull().default("done"),
		error: text(),
		lastFetchedAt: integer({ mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
		createdAt: integer({ mode: "timestamp" }).$defaultFn(() => new Date()),
		updatedAt: integer({ mode: "timestamp" }).$onUpdate(() => new Date()),
	}),
	(table) => [
		uniqueIndex("place_enrichment_place_id_unique_idx").on(table.placeId),
		index("place_enrichment_last_fetched_idx").on(table.lastFetchedAt),
		index("place_enrichment_status_idx").on(table.status),
		index("place_enrichment_has_website_idx").on(table.hasWebsite),
	],
);
