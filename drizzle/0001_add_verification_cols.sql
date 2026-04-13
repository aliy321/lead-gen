-- Add verification fields to lead table
ALTER TABLE `lead` ADD COLUMN `websiteVerified` integer;
ALTER TABLE `lead` ADD COLUMN `websiteVerifiedAt` integer;
ALTER TABLE `lead` ADD COLUMN `websiteManualOverride` integer;
ALTER TABLE `lead` ADD COLUMN `lastContactedAt` integer;
