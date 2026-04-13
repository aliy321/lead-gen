import { z } from "zod";

const GooglePlaceSchema = z.object({
	place_id: z.string(),
	name: z.string(),
	formatted_address: z.string().optional(),
	vicinity: z.string().optional(),
	geometry: z
		.object({
			location: z.object({
				lat: z.number(),
				lng: z.number(),
			}),
		})
		.optional(),
	rating: z.number().optional(),
	user_ratings_total: z.number().optional(),
	types: z.array(z.string()).optional(),
	opening_hours: z
		.object({
			weekday_text: z.array(z.string()).optional(),
		})
		.optional(),
	photos: z
		.array(
			z.object({
				photo_reference: z.string().optional(),
			}),
		)
		.optional(),
	website: z.string().optional(),
	formatted_phone_number: z.string().optional(),
	business_status: z.string().optional(),
	price_level: z.number().optional(),
	url: z.string().optional(),
	__apiKey: z.string().optional(),
});

export type GooglePlace = z.infer<typeof GooglePlaceSchema>;

const STREET_SEGMENT_PATTERN =
	/\b(street|st|road|rd|avenue|ave|boulevard|blvd|lane|ln|drive|dr|way|suite|unit|floor)\b/i;

const NON_BUSINESS_PLACE_TYPES = new Set([
	"locality",
	"neighborhood",
	"political",
	"route",
	"street_address",
	"sublocality",
	"sublocality_level_1",
	"sublocality_level_2",
	"administrative_area_level_1",
	"administrative_area_level_2",
	"administrative_area_level_3",
	"country",
	"postal_code",
]);

const BUSINESS_RELEVANT_PLACE_TYPES = new Set([
	"establishment",
	"point_of_interest",
	"store",
	"food",
	"health",
	"beauty_salon",
	"car_repair",
	"dentist",
	"doctor",
	"electrician",
	"lawyer",
	"moving_company",
	"plumber",
	"restaurant",
	"cafe",
	"lodging",
	"gym",
	"real_estate_agency",
	"travel_agency",
	"home_goods_store",
]);

function normalizeLocationSegment(segment: string) {
	return segment
		.replace(/\b\d{4,6}(?:-\d{3,4})?\b/g, "")
		.replace(/\s{2,}/g, " ")
		.trim();
}

export function extractAreaFromAddress(address: string): string | null {
	if (!address) return null;

	const segments = address
		.split(",")
		.map((segment) => normalizeLocationSegment(segment))
		.filter(Boolean);

	if (segments.length < 2) return null;

	for (let index = segments.length - 2; index >= 0; index -= 1) {
		const candidate = segments[index];
		if (!candidate) continue;
		if (candidate.length < 2) continue;
		if (STREET_SEGMENT_PATTERN.test(candidate)) continue;
		return candidate;
	}

	return null;
}

export function isBusinessPlace(place: GooglePlace) {
	const types = place.types ?? [];
	if (types.length === 0) return false;
	if (types.some((type) => NON_BUSINESS_PLACE_TYPES.has(type))) return false;
	return types.some((type) => BUSINESS_RELEVANT_PLACE_TYPES.has(type));
}

export function mapPlaceResult(place: GooglePlace, address: string) {
	const photoReference = place.photos?.find((photo) => photo.photo_reference)?.photo_reference;
	const apiKey = place.__apiKey;
	const photoUrl =
		photoReference && apiKey
			? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=360&photoreference=${encodeURIComponent(photoReference)}&key=${apiKey}`
			: undefined;
	return {
		id: place.place_id,
		name: place.name,
		address,
		area: extractAreaFromAddress(address),
		location: place.geometry?.location,
		rating: place.rating,
		userRatingsTotal: place.user_ratings_total,
		types: place.types,
		photoReference,
		photoUrl,
		website: place.website,
		phone: place.formatted_phone_number,
		businessStatus: place.business_status,
		priceLevel: place.price_level,
		openingHours: place.opening_hours?.weekday_text,
		googleMapsUrl: place.url,
	};
}

async function fetchGooglePage(url: string, params: URLSearchParams) {
	const response = await fetch(`${url}?${params.toString()}`);
	if (!response.ok) {
		throw new Error(`Google Places request failed with ${response.status}`);
	}

	return (await response.json()) as {
		results: GooglePlace[];
		next_page_token?: string;
		status?: string;
	};
}

const PAGE_TOKEN_DELAY_MS = 2_000;

export async function fetchPaginatedGooglePlaces({
	url,
	firstPageParams,
	limit,
}: {
	url: string;
	firstPageParams: URLSearchParams;
	limit: number;
}) {
	const maxCount = Math.max(10, Math.min(limit, 30));
	const collected: ReturnType<typeof mapPlaceResult>[] = [];

	let nextPageToken: string | undefined;
	let pageCount = 0;

	while (collected.length < maxCount && pageCount < 3) {
		const pageParams = new URLSearchParams(
			nextPageToken
				? { pagetoken: nextPageToken, key: firstPageParams.get("key") ?? "" }
				: firstPageParams,
		);

		if (nextPageToken) {
			await new Promise((resolve) => setTimeout(resolve, PAGE_TOKEN_DELAY_MS));
		}

		const data = await fetchGooglePage(url, pageParams);
		const pageKey = firstPageParams.get("key") ?? "";
		collected.push(
			...data.results
				.filter(isBusinessPlace)
				.map((place) =>
					mapPlaceResult(
						{ ...place, __apiKey: pageKey },
						place.formatted_address ?? place.vicinity ?? "",
					),
				),
		);

		nextPageToken = data.next_page_token;
		pageCount += 1;
		if (!nextPageToken) break;
	}

	return collected.slice(0, maxCount);
}

export async function fetchGooglePlaceDetails({
	apiKey,
	placeId,
}: {
	apiKey: string;
	placeId: string;
}) {
	const params = new URLSearchParams({
		place_id: placeId,
		fields:
			"place_id,name,formatted_address,geometry,rating,user_ratings_total,types,photos,website,formatted_phone_number,opening_hours,business_status,price_level,url",
		key: apiKey,
	});

	const response = await fetch(
		`https://maps.googleapis.com/maps/api/place/details/json?${params.toString()}`,
	);
	if (!response.ok) {
		throw new Error("Failed to fetch place details");
	}

	const data = (await response.json()) as { result: GooglePlace | null };
	if (!data.result) return null;

	const place = data.result;
	return mapPlaceResult(
		{ ...place, __apiKey: apiKey },
		place.formatted_address ?? "",
	);
}

const SOCIAL_PATTERNS = {
	instagram: /https?:\/\/(?:www\.)?instagram\.com\/[A-Za-z0-9_.-]+/gi,
	facebook: /https?:\/\/(?:www\.)?(?:facebook\.com|fb\.com)\/[A-Za-z0-9_.-]+/gi,
	linkedin:
		/https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/(?:company|in)\/[A-Za-z0-9_.-]+/gi,
};

export async function fetchWebsiteSignals(website: string | undefined) {
	if (!website) {
		return {
			socialLinks: [] as string[],
			hasContactForm: false,
		};
	}

	try {
		const response = await fetch(website, { redirect: "follow" });
		if (!response.ok) {
			return {
				socialLinks: [] as string[],
				hasContactForm: false,
			};
		}

		const html = await response.text();
		const socialLinks = Object.values(SOCIAL_PATTERNS).flatMap((pattern) =>
			Array.from(new Set(html.match(pattern) ?? [])),
		);
		const hasContactForm =
			/<form[\s\S]*?(contact|email|enquiry|inquiry)/i.test(html) ||
			/(contact us|get in touch|send message)/i.test(html);

		return {
			socialLinks: Array.from(new Set(socialLinks)).slice(0, 10),
			hasContactForm,
		};
	} catch (error) {
		console.warn("website-signal-fetch-failed", {
			website,
			error: error instanceof Error ? error.message : "unknown",
		});
		return {
			socialLinks: [] as string[],
			hasContactForm: false,
		};
	}
}
