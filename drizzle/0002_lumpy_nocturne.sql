CREATE TABLE IF NOT EXISTS `lead-gen_place_enrichments` (
	`id` text PRIMARY KEY NOT NULL,
	`placeId` text NOT NULL,
	`website` text,
	`hasWebsite` integer,
	`phone` text,
	`status` text DEFAULT 'done' NOT NULL,
	`error` text,
	`lastFetchedAt` integer NOT NULL,
	`createdAt` integer,
	`updatedAt` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `place_enrichment_place_id_unique_idx` ON `lead-gen_place_enrichments` (`placeId`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `place_enrichment_last_fetched_idx` ON `lead-gen_place_enrichments` (`lastFetchedAt`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `place_enrichment_status_idx` ON `lead-gen_place_enrichments` (`status`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `place_enrichment_has_website_idx` ON `lead-gen_place_enrichments` (`hasWebsite`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `lead_user_created_at_idx` ON `lead-gen_leads` (`createdById`,`createdAt`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `lead_user_status_score_idx` ON `lead-gen_leads` (`createdById`,`status`,`score`);