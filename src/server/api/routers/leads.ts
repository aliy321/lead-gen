import { z } from "zod";
import { TRPCError } from "@trpc/server";

import {
	createTRPCRouter,
	protectedProcedure,
} from "~/server/api/trpc";
import { leads, leadStatusEnum } from "~/server/db/schema";
import { and, eq } from "drizzle-orm";
import { env } from "~/env";
import {
	fetchGooglePlaceDetails,
	fetchWebsiteSignals,
} from "~/server/lib/google-places";

export const leadsRouter = createTRPCRouter({
	// Get all leads for the current user
	getAll: protectedProcedure.query(async ({ ctx }) => {
		return ctx.db.query.leads.findMany({
			where: eq(leads.createdById, ctx.session.user.id),
			orderBy: (leads, { desc }) => [desc(leads.createdAt)],
		});
	}),

	// Get leads by status
	getByStatus: protectedProcedure
		.input(z.object({ status: z.enum(leadStatusEnum) }))
		.query(async ({ ctx, input }) => {
			return ctx.db.query.leads.findMany({
				where: and(
					eq(leads.status, input.status),
					eq(leads.createdById, ctx.session.user.id),
				),
				orderBy: (leads, { desc }) => [desc(leads.score)],
			});
		}),

	// Save a new lead from Google Places data
	create: protectedProcedure
		.input(
			z.object({
				placeId: z.string(),
				name: z.string(),
				address: z.string().optional(),
				area: z.string().optional(),
				lat: z.number().optional(),
				lng: z.number().optional(),
				rating: z.number().optional(),
				reviewCount: z.number().optional(),
				types: z.string().optional(),
				website: z.string().optional(),
				phone: z.string().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const existingLead = await ctx.db.query.leads.findFirst({
				where: and(
					eq(leads.placeId, input.placeId),
					eq(leads.createdById, ctx.session.user.id),
				),
			});

			if (existingLead) {
				return existingLead;
			}

			const apiKey = env.GOOGLE_PLACES_API_KEY;
			let details: Awaited<ReturnType<typeof fetchGooglePlaceDetails>> = null;
			if (apiKey) {
				try {
					details = await fetchGooglePlaceDetails({
						apiKey,
						placeId: input.placeId,
					});
				} catch (error) {
					console.warn("lead-enrichment-details-failed", {
						placeId: input.placeId,
						error: error instanceof Error ? error.message : "unknown",
					});
				}
			}
			const website = details?.website ?? input.website;
			const websiteSignals = await fetchWebsiteSignals(website ?? undefined);
			const now = new Date();

			const [lead] = await ctx.db
				.insert(leads)
				.values({
					...input,
					name: details?.name ?? input.name,
					address: details?.address ?? input.address,
					area: details?.area ?? input.area,
					lat: details?.location?.lat ?? input.lat,
					lng: details?.location?.lng ?? input.lng,
					rating: details?.rating ?? input.rating,
					reviewCount: details?.userRatingsTotal ?? input.reviewCount,
					types: details?.types?.join(",") ?? input.types,
					website,
					phone: details?.phone ?? input.phone,
					hasWebsite: Boolean(website),
					websiteContactForm: websiteSignals.hasContactForm,
					googlePrimaryType: details?.types?.[0] ?? null,
					googlePriceLevel: details?.priceLevel,
					googleBusinessStatus: details?.businessStatus,
					openingHoursJson: details?.openingHours
						? JSON.stringify(details.openingHours)
						: null,
					socialLinksJson: JSON.stringify(websiteSignals.socialLinks),
					lastEnrichedAt: now,
					sourceUpdatedAt: now,
					createdById: ctx.session.user.id,
					status: "new",
				})
				.returning();
			return lead;
		}),

	// Update lead status
	updateStatus: protectedProcedure
		.input(
			z.object({
				id: z.string(),
				status: z.enum(leadStatusEnum),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const [lead] = await ctx.db
				.update(leads)
				.set({ status: input.status, updatedAt: new Date() })
				.where(
					and(
						eq(leads.id, input.id),
						eq(leads.createdById, ctx.session.user.id),
					),
				)
				.returning();

			if (!lead) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Lead not found",
				});
			}

			return lead;
		}),

	// Update lead details (notes, score, etc.)
	update: protectedProcedure
		.input(
			z.object({
				id: z.string(),
				notes: z.string().optional(),
				score: z.number().optional(),
				status: z.enum(leadStatusEnum).optional(),
				// Website checklist
				hasWebsite: z.boolean().optional(),
				websiteMobileFriendly: z.string().optional(),
				websiteHasCta: z.boolean().optional(),
				websiteModern: z.boolean().optional(),
				websiteSpeed: z.string().optional(),
				websiteSeo: z.boolean().optional(),
				websiteContactForm: z.boolean().optional(),
				// Verification
				websiteVerified: z.boolean().optional(),
				websiteManualOverride: z.boolean().optional(),
				lastContactedAt: z.date().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const { id, ...updateData } = input;
			const [lead] = await ctx.db
				.update(leads)
				.set({ ...updateData, updatedAt: new Date() })
				.where(
					and(eq(leads.id, id), eq(leads.createdById, ctx.session.user.id)),
				)
				.returning();

			if (!lead) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Lead not found",
				});
			}

			return lead;
		}),

	// Delete a lead
	delete: protectedProcedure
		.input(z.object({ id: z.string() }))
		.mutation(async ({ ctx, input }) => {
			const [deletedLead] = await ctx.db
				.delete(leads)
				.where(
					and(
						eq(leads.id, input.id),
						eq(leads.createdById, ctx.session.user.id),
					),
				)
				.returning({ id: leads.id });

			if (!deletedLead) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Lead not found",
				});
			}

			return { success: true };
		}),
});
