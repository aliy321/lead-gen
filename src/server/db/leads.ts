import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const leadStatusEnum = [
	"new",
	"reviewing",
	"qualified",
	"contacted",
	"replied",
	"demo_ready",
	"closed",
	"skipped",
] as const;
export type LeadStatus = (typeof leadStatusEnum)[number];

export const leads = sqliteTable(
	"lead-gen_leads",
	(d) => ({
		id: text()
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		placeId: text().notNull(),
		name: text().notNull(),
		address: text(),
		area: text(),
		lat: real(),
		lng: real(),
		rating: real(),
		reviewCount: integer(),
		types: text(),
		website: text(),
		phone: text(),
		status: text().default("new"),
		score: integer().default(0),
		notes: text(),
		hasWebsite: integer({ mode: "boolean" }),
		websiteMobileFriendly: text(),
		websiteHasCta: integer({ mode: "boolean" }),
		websiteModern: integer({ mode: "boolean" }),
		websiteSpeed: text(),
		websiteSeo: integer({ mode: "boolean" }),
		websiteContactForm: integer({ mode: "boolean" }),
		websiteVerified: integer({ mode: "boolean" }),
		websiteVerifiedAt: integer({ mode: "timestamp" }),
		websiteManualOverride: integer({ mode: "boolean" }),
		lastContactedAt: integer({ mode: "timestamp" }),
		googlePrimaryType: text(),
		googlePriceLevel: integer(),
		googleBusinessStatus: text(),
		openingHoursJson: text(),
		socialLinksJson: text(),
		lastEnrichedAt: integer({ mode: "timestamp" }),
		sourceUpdatedAt: integer({ mode: "timestamp" }),
		createdById: text().notNull(),
		createdAt: integer({ mode: "timestamp" }).$defaultFn(() => new Date()),
		updatedAt: integer({ mode: "timestamp" }).$onUpdate(() => new Date()),
	}),
	(table) => [
		index("lead_created_by_idx").on(table.createdById),
		index("lead_created_at_idx").on(table.createdAt),
		index("lead_user_created_at_idx").on(table.createdById, table.createdAt),
		index("lead_user_status_score_idx").on(
			table.createdById,
			table.status,
			table.score,
		),
		uniqueIndex("lead_user_place_unique_idx").on(table.createdById, table.placeId),
	],
);
