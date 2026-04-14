CREATE TABLE IF NOT EXISTS `lead-gen_enrichment_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`sessionId` text NOT NULL,
	`placeId` text NOT NULL,
	`userId` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`error` text,
	`createdAt` integer,
	`updatedAt` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `enrichment_jobs_session_place_unique_idx` ON `lead-gen_enrichment_jobs` (`sessionId`,`placeId`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `enrichment_jobs_session_idx` ON `lead-gen_enrichment_jobs` (`sessionId`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `enrichment_jobs_user_idx` ON `lead-gen_enrichment_jobs` (`userId`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `enrichment_jobs_status_idx` ON `lead-gen_enrichment_jobs` (`status`);
