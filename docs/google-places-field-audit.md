# Google Places Field Audit

## Endpoints Audited

- `textsearch` (`places.search`)
- `nearbysearch` (`places.nearby`)
- `details` (`places.details`)

## Fields Currently Collected

### Common Search Fields

- `place_id`
- `name`
- `formatted_address` / `vicinity`
- `geometry.location.lat`
- `geometry.location.lng`
- `rating`
- `user_ratings_total`
- `types[]`
- `website` (mostly from details; sometimes sparse in search)
- `formatted_phone_number` (mostly from details)

### Details-Only Fields Added

- `opening_hours.weekday_text`
- `business_status`
- `price_level`
- `url` (Google Maps URL)

## Normalized Internal Shape

```ts
{
  id: string; // place_id
  name: string;
  address: string;
  area: string | null;
  location?: { lat: number; lng: number };
  rating?: number;
  userRatingsTotal?: number;
  types?: string[];
  website?: string;
  phone?: string;
  businessStatus?: string;
  priceLevel?: number;
  openingHours?: string[];
  googleMapsUrl?: string;
}
```

## Lead Enrichment Fields Persisted

- `googlePrimaryType`
- `googlePriceLevel`
- `googleBusinessStatus`
- `openingHoursJson`
- `socialLinksJson`
- `lastEnrichedAt`
- `sourceUpdatedAt`

## Notes

- Results are filtered for business-relevant place types.
- Pagination is applied to fill target result counts (10/20/30) when possible.
- Data is best-effort; UI should tolerate missing optional fields.
