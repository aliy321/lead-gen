CREATE TABLE IF NOT EXISTS `lead-gen_leads` (
	`id` text PRIMARY KEY NOT NULL,
	`placeId` text NOT NULL,
	`name` text NOT NULL,
	`address` text,
	`area` text,
	`lat` real,
	`lng` real,
	`rating` real,
	`reviewCount` integer,
	`types` text,
	`website` text,
	`phone` text,
	`status` text DEFAULT 'new',
	`score` integer DEFAULT 0,
	`notes` text,
	`hasWebsite` integer,
	`websiteMobileFriendly` text,
	`websiteHasCta` integer,
	`websiteModern` integer,
	`websiteSpeed` text,
	`websiteSeo` integer,
	`websiteContactForm` integer,
	`websiteVerified` integer,
	`websiteVerifiedAt` integer,
	`websiteManualOverride` integer,
	`lastContactedAt` integer,
	`googlePrimaryType` text,
	`googlePriceLevel` integer,
	`googleBusinessStatus` text,
	`openingHoursJson` text,
	`socialLinksJson` text,
	`lastEnrichedAt` integer,
	`sourceUpdatedAt` integer,
	`createdById` text NOT NULL,
	`createdAt` integer,
	`updatedAt` integer
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `lead_created_by_idx` ON `lead-gen_leads` (`createdById`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `lead_created_at_idx` ON `lead-gen_leads` (`createdAt`);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `lead_user_place_unique_idx` ON `lead-gen_leads` (`createdById`,`placeId`);--> statement-breakpoint
DROP TABLE IF EXISTS `lead`;