"use client";

import {
    memo,
    type RefObject,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    Suspense,
} from "react";
import {
    useQueryState,
    parseAsString,
    parseAsFloat,
    parseAsInteger,
} from "nuqs";
import {
    Search,
    MapPin,
    Bug,
    List,
    Star,
    X,
    Globe,
    Phone,
    Plus,
    Trash2,
    CircleIcon,
    CircleDashedIcon,
    FilterX,
    LocateFixed,
    ExternalLink,
} from "lucide-react";
import {
    Map,
    MapCircle,
    MapControlContainer,
    MapPopup,
    MapTileLayer,
    MapMarker,
    MapMarkerClusterGroup,
    MapMoveHandler,
    MapTooltip,
    MapZoomControl,
    MapLocateControl,
    MapFullscreenControl,
} from "~/components/ui/map";
import Image from "next/image";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Separator } from "~/components/ui/separator";
import { Spinner } from "~/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { Textarea } from "~/components/ui/textarea";
import { api } from "~/trpc/react";
import { cn } from "~/lib/utils";
import { toast } from "sonner";
import ListItem from "~/components/search/list-item";
import SearchInput from "~/components/search/input";
import SearchFilter from "~/components/search/filter";
import {
    STATUS_LABELS,
    type Business,
    type DisplayBusiness,
    type LeadStatus,
    type SavedLead,
} from "./types";
import ListItemLoading from "~/components/search/list-item-loading";
import { MapPopoverContent } from "~/components/search/popover-content";

function getPlacePhotoUrl(photoUrl?: string, photoReference?: string) {
    if (photoUrl) return photoUrl;
    if (!photoReference) return null;
    // Fallback for any older cached payloads where only reference exists.
    return `https://maps.googleapis.com/maps/api/place/photo?maxwidth=360&photoreference=${encodeURIComponent(photoReference)}`;
}

const MIN_SEARCH_CHARS = 2;
const DEFAULT_RADIUS_METERS = 1000;
const DEFAULT_RESULT_LIMIT = 10;
const MIN_FOCUS_ZOOM = 17;
const MAP_MIN_ZOOM = 3;
const MAP_MAX_ZOOM = 18;
const ENRICHMENT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const ENRICH_DELAY_MS = 450;
const ENRICHMENT_FLUSH_BATCH_SIZE = 10;
const ENABLE_PLACE_ENRICHMENT = false;
const SEARCH_AREA_COOLDOWN_MS = 1500;
const ENRICHMENT_STATUS_POLL_MAX_MS = 3 * 60_000;

type EnrichmentStatus = "idle" | "loading" | "done" | "error";
type WebsiteState = "unknown" | "yes" | "no";

interface PlaceDetailsCacheEntry {
    status: EnrichmentStatus;
    website?: string | null;
    phone?: string | null;
    hasWebsite?: boolean | null;
    lastFetchedAt?: string | Date | null;
}


function getFetchedAtTimestamp(value: PlaceDetailsCacheEntry["lastFetchedAt"]) {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    const timestamp = date.getTime();
    return Number.isNaN(timestamp) ? null : timestamp;
}

function areCacheEntriesEqual(
    previousEntry?: PlaceDetailsCacheEntry,
    nextEntry?: PlaceDetailsCacheEntry,
) {
    if (previousEntry === nextEntry) return true;
    if (!previousEntry || !nextEntry) return false;

    return (
        previousEntry.status === nextEntry.status &&
        previousEntry.website === nextEntry.website &&
        previousEntry.phone === nextEntry.phone &&
        previousEntry.hasWebsite === nextEntry.hasWebsite &&
        getFetchedAtTimestamp(previousEntry.lastFetchedAt) ===
        getFetchedAtTimestamp(nextEntry.lastFetchedAt)
    );
}

function toRadians(value: number) {
    return (value * Math.PI) / 180;
}

function calculateDistanceKm(
    from: [number, number],
    to: [number, number],
) {
    const earthRadiusKm = 6371;
    const latDelta = toRadians(to[0] - from[0]);
    const lngDelta = toRadians(to[1] - from[1]);
    const fromLat = toRadians(from[0]);
    const toLat = toRadians(to[0]);

    const a =
        Math.sin(latDelta / 2) * Math.sin(latDelta / 2) +
        Math.cos(fromLat) *
        Math.cos(toLat) *
        Math.sin(lngDelta / 2) *
        Math.sin(lngDelta / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return earthRadiusKm * c;
}

function getContactabilityScore(business: {
    website?: string;
    phone?: string;
}) {
    if (!business.website && !business.phone) return undefined;
    let score = 0;
    if (business.website) score += 65;
    if (business.phone) score += 35;
    return score;
}

function getWebsiteState({
    cacheEntry,
    fallbackWebsite,
    fallbackHasWebsite,
}: {
    cacheEntry?: PlaceDetailsCacheEntry;
    fallbackWebsite?: string;
    fallbackHasWebsite?: boolean | null;
}): WebsiteState {
    if (cacheEntry?.status === "done") {
        if (cacheEntry.hasWebsite === true) return "yes";
        if (cacheEntry.hasWebsite === false) return "no";
        return cacheEntry.website ? "yes" : "no";
    }
    if (fallbackHasWebsite === true) return "yes";
    if (fallbackHasWebsite === false) return "no";
    if (fallbackWebsite) return "yes";
    return "unknown";
}

function getSafeExternalUrl(url: string | null | undefined) {
    if (!url) return null;
    try {
        const normalized = /^https?:\/\//i.test(url) ? url : `https://${url}`;
        const parsed = new URL(normalized);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
            return null;
        }
        return parsed.toString();
    } catch {
        return null;
    }
}

interface LeadMapPanelProps {
    mapCenter: [number, number];
    mapZoom: number;
    mapRef: RefObject<any>;
    mapViewportRef: RefObject<{ center: [number, number]; zoom: number }>;
    isZoomingToMarker: RefObject<boolean>;
    hasSearched: boolean;
    searchQueryEnabled: boolean;
    showRadius: boolean;
    radius: number;
    radiusCenter: [number, number];
    mappableBusinesses: DisplayBusiness[];
    enrichedMarkerBusinesses: DisplayBusiness[];
    selectedBusinessId: string | null;
    savedLeadPlaceIds: Set<string>;
    placeDetailsCache: Record<string, PlaceDetailsCacheEntry>;
    isSearchTab: boolean;
    isLoadingNearby: boolean;
    isSearchCooldown: boolean;
    showEnrichmentDebug: boolean;
    isEnrichmentRunning: boolean;
    onToggleRadius: () => void;
    onToggleEnrichmentDebug: () => void;
    onSearchThisArea: (center: [number, number]) => void;
    onLocateFound: (e: any) => void;
    onMarkerClick: (businessId: string) => void;
    onSaveBusiness: (business: DisplayBusiness) => void;
    onMapMoveEnd: (center: [number, number], zoom: number) => void;
}

interface MapMarkersLayerProps {
    mappableBusinesses: DisplayBusiness[];
    selectedBusinessId: string | null;
    savedLeadPlaceIds: Set<string>;
    placeDetailsCache: Record<string, PlaceDetailsCacheEntry>;
    isSearchTab: boolean;
    onMarkerClick: (businessId: string) => void;
    onSaveBusiness: (business: DisplayBusiness) => void;
}

interface MapBusinessMarkerProps {
    business: DisplayBusiness;
    isSelected: boolean;
    isSaved: boolean;
    cacheEntry?: PlaceDetailsCacheEntry;
    isSearchTab: boolean;
    onMarkerClick: (businessId: string) => void;
    onSaveBusiness: (business: DisplayBusiness) => void;
}

const EnrichmentProgressBadge = memo(function EnrichmentProgressBadge({
    isRunning,
}: {
    isRunning: boolean;
}) {
    if (!isRunning) return null;

    return (
        <div className="rounded-full border bg-popover/95 px-2 py-0.5  shadow flex items-center gap-1">
            <Spinner className="size-2" />
            <p className="text-xs text-muted-foreground -tracking-wide font-mono tabular-nums">
                Enriching details in background...
            </p>
        </div>
    );
});

const MapBusinessMarker = memo(function MapBusinessMarker({
    business,
    isSelected,
    isSaved,
    cacheEntry,
    isSearchTab,
    onMarkerClick,
    onSaveBusiness,
}: MapBusinessMarkerProps) {
    const websiteState = isSearchTab
        ? getWebsiteState({
            cacheEntry,
            fallbackWebsite: business.website,
            fallbackHasWebsite: business.hasWebsite ?? null,
        })
        : (business.website ? "yes" : "no");
    const markerColorClass =
        websiteState === "yes"
            ? "bg-emerald-500"
            : websiteState === "no"
                ? "bg-red-500"
                : "bg-zinc-400";

    return (
        <MapMarker
            key={business.id}
            position={[business.lat, business.lng]}
            iconAnchor={[6, 6]}
            icon={
                <div className="relative flex items-center justify-center">
                    <p
                        className={cn(
                            "absolute bottom-full left-1/2 mb-1 -translate-x-1/2 whitespace-nowrap rounded border border-border bg-background p-1 text-[10px] leading-none shadow-sm font-mono",
                            isSelected && "border-primary",
                        )}
                    >
                        {business.name}
                    </p>
                    <span
                        className={cn(
                            "size-3 rounded-full border border-border shadow-sm",
                            markerColorClass,
                            isSelected &&
                            "ring-2 ring-primary/50 ring-offset-2 ring-offset-background",
                        )}
                    />
                </div>
            }
            eventHandlers={{
                click: () => onMarkerClick(business.id),
            }}
        >
            <MapTooltip side="top">
                <div className="max-w-56 w-56 overflow-hidden rounded-md border bg-background shadow-sm">
                    {getPlacePhotoUrl(business.photoUrl, business.photoReference) ? (
                        <Image
                            src={getPlacePhotoUrl(business.photoUrl, business.photoReference) ?? ""}
                            alt={`${business.name} place photo`}
                            width={224}
                            height={96}
                            quality={60}
                            sizes="224px"
                            className="h-24 w-full object-cover"
                        />
                    ) : (
                        <div className="flex h-24 w-full items-center justify-center bg-muted text-xs text-muted-foreground">
                            No place photo
                        </div>
                    )}

                    <div className="space-y-1 p-2 text-muted-foreground">
                        <p className="line-clamp-1 font-medium text-sm truncate">
                            {business.name}
                        </p>
                        <p className="text-[10px] truncate line-clamp-1">
                            {business.address}
                        </p>
                    </div>
                </div>
            </MapTooltip>
            <MapPopup className="w-64 max-w-64">
                <MapPopoverContent
                    business={business}
                    cacheEntry={cacheEntry}
                    isSearchTab={isSearchTab}
                    isSaved={isSaved}
                    onSaveBusiness={onSaveBusiness}
                />
            </MapPopup>
        </MapMarker>
    );
}, (previousProps, nextProps) => {
    const previousBusiness = previousProps.business;
    const nextBusiness = nextProps.business;

    const isBusinessStable =
        previousBusiness === nextBusiness ||
        (
            previousBusiness.id === nextBusiness.id &&
            previousBusiness.name === nextBusiness.name &&
            previousBusiness.address === nextBusiness.address &&
            previousBusiness.lat === nextBusiness.lat &&
            previousBusiness.lng === nextBusiness.lng &&
            previousBusiness.rating === nextBusiness.rating &&
            previousBusiness.userRatingsTotal === nextBusiness.userRatingsTotal &&
            previousBusiness.photoUrl === nextBusiness.photoUrl &&
            previousBusiness.photoReference === nextBusiness.photoReference &&
            previousBusiness.website === nextBusiness.website &&
            previousBusiness.phone === nextBusiness.phone &&
            previousBusiness.googleMapsUrl === nextBusiness.googleMapsUrl
        );

    return (
        isBusinessStable &&
        previousProps.isSelected === nextProps.isSelected &&
        previousProps.isSaved === nextProps.isSaved &&
        previousProps.isSearchTab === nextProps.isSearchTab &&
        previousProps.onMarkerClick === nextProps.onMarkerClick &&
        previousProps.onSaveBusiness === nextProps.onSaveBusiness &&
        areCacheEntriesEqual(previousProps.cacheEntry, nextProps.cacheEntry)
    );
});

const MapMarkersLayer = memo(function MapMarkersLayer({
    mappableBusinesses,
    selectedBusinessId,
    savedLeadPlaceIds,
    placeDetailsCache,
    isSearchTab,
    onMarkerClick,
    onSaveBusiness,
}: MapMarkersLayerProps) {
    return (
        <MapMarkerClusterGroup
            disableClusteringAtZoom={17}
            spiderfyOnMaxZoom
            zoomToBoundsOnClick
        >
            {mappableBusinesses.map((business) => (
                <MapBusinessMarker
                    key={business.id}
                    business={business}
                    isSelected={selectedBusinessId === business.id}
                    isSaved={savedLeadPlaceIds.has(business.id)}
                    cacheEntry={placeDetailsCache[business.id]}
                    isSearchTab={isSearchTab}
                    onMarkerClick={onMarkerClick}
                    onSaveBusiness={onSaveBusiness}
                />
            ))}
        </MapMarkerClusterGroup>
    );
});

const LeadMapPanel = memo(function LeadMapPanel({
    mapCenter,
    mapZoom,
    mapRef,
    mapViewportRef,
    isZoomingToMarker,
    hasSearched,
    searchQueryEnabled,
    showRadius,
    radius,
    radiusCenter,
    mappableBusinesses,
    enrichedMarkerBusinesses,
    selectedBusinessId,
    savedLeadPlaceIds,
    placeDetailsCache,
    isSearchTab,
    isLoadingNearby,
    isSearchCooldown,
    showEnrichmentDebug,
    isEnrichmentRunning,
    onToggleRadius,
    onToggleEnrichmentDebug,
    onSearchThisArea,
    onLocateFound,
    onMarkerClick,
    onSaveBusiness,
    onMapMoveEnd,
}: LeadMapPanelProps) {
    const zoomPercent = Math.round(
        ((mapZoom - MAP_MIN_ZOOM) / (MAP_MAX_ZOOM - MAP_MIN_ZOOM)) * 100,
    );
    const [searchCenter, setSearchCenter] = useState<[number, number]>(radiusCenter);
    useEffect(() => {
        setSearchCenter(radiusCenter);
    }, [radiusCenter]);
    const enrichmentDebugRows = useMemo(
        () => {
            return enrichedMarkerBusinesses.slice(0, 80).map((business) => {
                const entry = placeDetailsCache[business.id];
                const status = entry?.status ?? "done";
                const hasWebsite =
                    entry?.hasWebsite === true || Boolean(entry?.website || business.website)
                        ? "yes"
                        : entry?.hasWebsite === false
                            ? "no"
                            : "-";
                const hasPhone = entry?.phone || business.phone ? "yes" : "-";

                return {
                    id: business.id,
                    name: business.name,
                    status,
                    hasWebsite,
                    hasPhone,
                };
            });
        },
        [enrichedMarkerBusinesses, placeDetailsCache],
    );
    const mapMarkerBusinesses = showEnrichmentDebug
        ? enrichedMarkerBusinesses
        : mappableBusinesses;

    return (
        <div className="relative h-full flex-1">
            <Map
                center={mapCenter}
                zoom={mapZoom}
                minZoom={MAP_MIN_ZOOM}
                maxZoom={MAP_MAX_ZOOM}
                ref={mapRef}
                className="h-full w-full"
            >
                <MapTileLayer maxNativeZoom={MAP_MAX_ZOOM} />
                <MapMoveHandler
                    onMoveEnd={(center, zoom) => {
                        mapViewportRef.current = { center, zoom };
                        onMapMoveEnd(center, zoom);
                        if (isZoomingToMarker.current) {
                            isZoomingToMarker.current = false;
                            return;
                        }
                    }}
                />

                {hasSearched && !searchQueryEnabled && showRadius && (
                    <MapCircle
                        center={searchCenter}
                        radius={radius}
                        pathOptions={{
                            color: "#3b82f6",
                            fillColor: "#3b82f6",
                            fillOpacity: 0.1,
                            weight: 2,
                            dashArray: "5, 10",
                        }}
                    />
                )}

                {hasSearched && !searchQueryEnabled && showRadius && (
                    <MapMarker
                        position={searchCenter}
                        draggable
                        iconAnchor={[16, 16]}
                        icon={
                            <div className="flex size-8 items-center justify-center rounded-full border-2 border-primary/50 bg-background shadow-md">
                                <LocateFixed className="size-4 text-primary" />
                            </div>
                        }
                        eventHandlers={{
                            dragend: ((event: any) => {
                                const { lat, lng } = event.target.getLatLng();
                                setSearchCenter([lat, lng]);
                            }) as unknown as () => void,
                        }}
                    >
                        <MapTooltip side="top" className="maptooltip-draggable">Drag search center</MapTooltip>
                    </MapMarker>
                )}

                <MapMarkersLayer
                    mappableBusinesses={mapMarkerBusinesses}
                    selectedBusinessId={selectedBusinessId}
                    savedLeadPlaceIds={savedLeadPlaceIds}
                    placeDetailsCache={placeDetailsCache}
                    isSearchTab={isSearchTab}
                    onMarkerClick={onMarkerClick}
                    onSaveBusiness={onSaveBusiness}
                />

                <div className="absolute mx-auto bottom-1 left-1/2 z-1000 m-2 flex -translate-x-1/2 items-center gap-2">
                    <Button
                        type="button"
                        onClick={onToggleRadius}
                        size="icon"
                        variant={showRadius ? "default" : "outline"}
                        title={showRadius ? "Hide radius" : "Show radius"}
                    >
                        {showRadius ? <CircleIcon /> : <CircleDashedIcon />}
                    </Button>
                    <MapZoomControl orientation="horizontal" className="static" />
                    <MapLocateControl className="static" onLocationFound={onLocateFound} />
                    <MapFullscreenControl className="static" />
                    <Button
                        type="button"
                        onClick={onToggleEnrichmentDebug}
                        size="icon"
                        variant={showEnrichmentDebug ? "default" : "outline"}
                        title={showEnrichmentDebug ? "Hide enrichment debug" : "Show enrichment debug"}
                    >
                        <Bug />
                    </Button>
                </div>

                <MapControlContainer className="border-border bg-background hover:bg-muted hover:text-foreground dark:bg-transparent dark:hover:bg-input/30 backdrop-blur text-popover-foreground bottom-1 left-1 m-2 flex flex-col gap-2 rounded-md border p-2 shadow">
                    <div className="flex items-center gap-2">
                        <div className="size-3 rounded-full border border-border bg-emerald-500" />
                        <span className="text-xs">Has website</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="size-3 rounded-full border border-border bg-red-500" />
                        <span className="text-xs">No website</span>
                    </div>
                    {isSearchTab && (
                        <div className="flex items-center gap-2">
                            <div className="size-3 rounded-full border border-border bg-zinc-400" />
                            <span className="text-xs">Unknown / checking</span>
                        </div>
                    )}
                    {hasSearched && !searchQueryEnabled && showRadius && (
                        <div className="flex items-center gap-2">
                            <div className="size-3 rounded-full border-2 border-primary bg-white" />
                            <span className="text-xs">Search center (draggable)</span>
                        </div>
                    )}
                </MapControlContainer>

                <div className="border-border bg-background hover:bg-muted hover:text-foreground dark:bg-transparent dark:hover:bg-input/30 backdrop-blur text-popover-foreground absolute top-4 right-4 z-1000 rounded-full border px-3 py-1 text-xs shadow tabular-nums">
                    Zoom: {Math.max(0, Math.min(100, zoomPercent))}%
                    {/* (z{mapZoom}) */}
                </div>

                {!searchQueryEnabled && (
                    <div className="absolute top-4 left-1/2 z-1000 flex -translate-x-1/2 flex-col items-center gap-1">
                        <Button
                            type="button"
                            onClick={() => onSearchThisArea(searchCenter)}
                            disabled={isLoadingNearby || isSearchCooldown}
                            className="rounded-full shadow-lg"
                        >
                            {isLoadingNearby ? <Spinner /> : <MapPin />}
                            {isLoadingNearby ? "Searching..." : "Search This Area"}
                        </Button>
                        <EnrichmentProgressBadge
                            isRunning={isEnrichmentRunning}
                        />
                    </div>
                )}
            </Map>
        </div>
    );
});

function LeadPageContent() {
    const utils = api.useUtils();

    // URL state
    const [tab, setTab] = useQueryState(
        "tab",
        parseAsString.withDefault("search"),
    );
    const [searchQuery, setSearchQuery] = useQueryState(
        "q",
        parseAsString.withDefault(""),
    );
    const [searchInput, setSearchInput] = useState(searchQuery);
    const [selectedIdx, setSelectedIdx] = useQueryState("idx", parseAsInteger);
    const [selectedBusinessId, setSelectedBusinessId] = useState<string | null>(null);
    const [selectedLeadId, setSelectedLeadId] = useQueryState(
        "lead",
        parseAsString,
    );
    const [leadSearchTerm, setLeadSearchTerm] = useState("");
    const [leadStatusFilter, setLeadStatusFilter] = useState<LeadStatus | "all">("all");
    const [leadSort, setLeadSort] = useState<"newest" | "score_desc">("newest");
    const [leadPage, setLeadPage] = useState(1);
    const leadPageSize = 12;
    const [lat, setLat] = useQueryState("lat", parseAsFloat.withDefault(40.7128));
    const [lng, setLng] = useQueryState("lng", parseAsFloat.withDefault(-74.006));
    const [zoom, setZoom] = useQueryState("z", parseAsInteger.withDefault(14));

    // Local map state (separate from URL, used for smooth panning)
    const [mapCenter, setMapCenter] = useState<[number, number]>([
        lat ?? 40.7128,
        lng ?? -74.006,
    ]);
    const [mapZoom, setMapZoom] = useState(zoom ?? 14);
    const [radius, setRadius] = useState(DEFAULT_RADIUS_METERS);
    const [radiusCenter, setRadiusCenter] = useState<[number, number]>([
        lat ?? 40.7128,
        lng ?? -74.006,
    ]);
    const [showRadius, setShowRadius] = useState(true);

    const mapRef = useRef<any>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const isZoomingToMarker = useRef(false);
    const mapViewportRef = useRef<{ center: [number, number]; zoom: number }>({
        center: [lat ?? 40.7128, lng ?? -74.006],
        zoom: zoom ?? 14,
    });
    const leadStatusQuery = leadStatusFilter === "all" ? undefined : leadStatusFilter;

    // Fetch saved leads
    const { data: savedLeadsResponse, refetch: refetchLeads } = api.leads.getAll.useQuery(
        {
            page: leadPage,
            pageSize: leadPageSize,
            query: leadSearchTerm.trim() || undefined,
            status: leadStatusQuery,
            sort: leadSort,
        },
        {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
        },
    );
    const savedLeads = savedLeadsResponse?.items ?? [];
    const hasMoreLeads = savedLeadsResponse?.hasMore ?? false;

    const createLeadMutation = api.leads.create.useMutation({
        onSuccess: () => {
            toast.success("Lead saved");
            void refetchLeads();
        },
        onError: (error) => {
            toast.error(error.message || "Failed to save lead");
        },
    });
    const deleteLeadMutation = api.leads.delete.useMutation({
        onSuccess: () => {
            toast.success("Lead deleted");
            void refetchLeads();
        },
        onError: (error) => {
            toast.error(error.message || "Failed to delete lead");
        },
    });
    const updateLeadMutation = api.leads.update.useMutation({
        onSuccess: () => {
            toast.success("Lead updated");
            void refetchLeads();
        },
        onError: (error) => {
            toast.error(error.message || "Failed to update lead");
        },
    });

    // Local state for selected saved lead detail panel
    const [leadNotes, setLeadNotes] = useState("");
    const [leadStatus, setLeadStatus] = useState<LeadStatus>("new");
    const [leadScore, setLeadScore] = useState(0);

    // Manual trigger for nearby search
    const [hasSearched, setHasSearched] = useState(false);
    const [locationLoading, setLocationLoading] = useState(false);
    const [showEnrichmentDebug, setShowEnrichmentDebug] = useState(false);

    // Filters
    const [filterMinRating, setFilterMinRating] = useState<number>(0);
    const [filterHasWebsite, setFilterHasWebsite] = useState<boolean | null>(
        null,
    );
    const [resultLimit, setResultLimit] = useState(DEFAULT_RESULT_LIMIT);
    const [isSearchCooldown, setIsSearchCooldown] = useState(false);
    const [isEnrichmentRunning, setIsEnrichmentRunning] = useState(false);
    const [placeDetailsCache, setPlaceDetailsCache] = useState<
        Record<string, PlaceDetailsCacheEntry>
    >({});
    const enrichmentQueueRef = useRef<string[]>([]);
    const enrichmentInFlightRef = useRef(new Set<string>());
    const enrichmentProcessingRef = useRef(false);
    const enrichmentSessionRef = useRef(0);
    const pendingCacheUpdatesRef = useRef<Record<string, PlaceDetailsCacheEntry>>({});
    const selectedBusinessIdRef = useRef<string | null>(null);
    const searchCooldownTimerRef = useRef<number | null>(null);
    const hydratedPlaceIdsKeyRef = useRef("");
    // Derived values
    const normalizedSearchQuery = searchQuery.trim();
    const searchQueryEnabled = normalizedSearchQuery.length >= MIN_SEARCH_CHARS;

    useEffect(() => {
        setSearchInput(searchQuery);
    }, [searchQuery]);

    useEffect(() => {
        if (searchInput.trim().length === 0) {
            void setSearchQuery("");
            return;
        }

        const debounceTimer = setTimeout(() => {
            void setSearchQuery(searchInput);
        }, 350);

        return () => clearTimeout(debounceTimer);
    }, [searchInput, setSearchQuery]);

    // Auto-detect user location on mount
    useEffect(() => {
        if (hasSearched || searchQueryEnabled) return;

        const detectLocation = () => {
            setLocationLoading(true);
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        const { latitude, longitude } = position.coords;
                        setMapCenter([latitude, longitude]);
                        setRadiusCenter([latitude, longitude]);
                        setMapZoom(14);
                        setLat(latitude);
                        setLng(longitude);
                        setHasSearched(true);
                        setLocationLoading(false);
                    },
                    () => {
                        setLocationLoading(false);
                    },
                );
            } else {
                setLocationLoading(false);
            }
        };

        detectLocation();
    }, [hasSearched, searchQueryEnabled, setLat, setLng]);

    const { data: searchResults, isLoading: isSearching } =
        api.places.search.useQuery(
            { query: searchQuery, limit: resultLimit },
            {
                enabled: searchQueryEnabled,
                staleTime: 30_000,
                refetchOnWindowFocus: false,
            },
        );
    const enrichPlaceMutation = api.places.enrich.useMutation();

    const { data: nearbyResults, isLoading: isLoadingNearby } =
        api.places.nearby.useQuery(
            { lat, lng, radius, limit: resultLimit },
            {
                enabled: !searchQueryEnabled && hasSearched && !!lat && !!lng,
                staleTime: 30_000,
                refetchOnWindowFocus: false,
            },
        );
    const { data: enrichedMarkers = [] } = api.places.enrichedMarkers.useQuery(undefined, {
        enabled: showEnrichmentDebug,
        staleTime: 30_000,
        refetchOnWindowFocus: false,
    });

    const businesses = useMemo<Business[]>(() => {
        const source = searchQueryEnabled
            ? (searchResults ?? [])
            : (nearbyResults ?? []);

        return source.map((place) => ({
            id: place.id,
            name: place.name,
            address: place.address,
            area: place.area,
            lat: place.location?.lat ?? 0,
            lng: place.location?.lng ?? 0,
            rating: place.rating,
            userRatingsTotal: place.userRatingsTotal,
            types: place.types,
            photoUrl: place.photoUrl,
            website: place.website,
            photoReference: place.photoReference,
            phone: place.phone,
            businessStatus: place.businessStatus,
            priceLevel: place.priceLevel,
            openingHours: place.openingHours,
            googleMapsUrl: place.googleMapsUrl,
        }));
    }, [searchQueryEnabled, searchResults, nearbyResults]);

    const isLoading = searchQueryEnabled ? isSearching : isLoadingNearby;

    const enqueuePriorityPlace = useCallback((placeId: string) => {
        enrichmentQueueRef.current = [
            placeId,
            ...enrichmentQueueRef.current.filter((queuedId) => queuedId !== placeId),
        ];
    }, []);

    const getVisiblePlaceIds = useCallback(
        (placeIds: string[]) => {
            if (!mapRef.current?.getBounds) return [];
            const bounds = mapRef.current.getBounds();
            return businesses
                .filter(
                    (business) =>
                        placeIds.includes(business.id) &&
                        business.lat !== 0 &&
                        business.lng !== 0 &&
                        bounds.contains([business.lat, business.lng]),
                )
                .map((business) => business.id);
        },
        [businesses],
    );

    const processEnrichmentQueue = useCallback(
        async (sessionId: number) => {
            if (!ENABLE_PLACE_ENRICHMENT) return;
            if (enrichmentProcessingRef.current) return;
            enrichmentProcessingRef.current = true;
            let batchedUpdates = 0;

            const flushPendingCacheUpdates = () => {
                const pending = pendingCacheUpdatesRef.current;
                const pendingKeys = Object.keys(pending);
                if (pendingKeys.length === 0) return;
                pendingCacheUpdatesRef.current = {};
                setPlaceDetailsCache((prev) => {
                    let changed = false;
                    const next = { ...prev };

                    for (const placeId of pendingKeys) {
                        const pendingEntry = pending[placeId];
                        if (!pendingEntry) {
                            continue;
                        }
                        if (areCacheEntriesEqual(prev[placeId], pendingEntry)) {
                            continue;
                        }
                        next[placeId] = pendingEntry;
                        changed = true;
                    }

                    return changed ? next : prev;
                });
            };

            while (enrichmentQueueRef.current.length > 0) {
                if (sessionId !== enrichmentSessionRef.current) {
                    break;
                }

                const placeId = enrichmentQueueRef.current.shift();
                if (!placeId) continue;
                if (enrichmentInFlightRef.current.has(placeId)) continue;

                enrichmentInFlightRef.current.add(placeId);

                try {
                    const result = await enrichPlaceMutation.mutateAsync({
                        placeId,
                        force: true,
                    });
                    pendingCacheUpdatesRef.current[placeId] = {
                        status: result.status === "error" ? "error" : "done",
                        website: result.website,
                        phone: result.phone,
                        hasWebsite: result.hasWebsite,
                        lastFetchedAt: result.lastFetchedAt ?? null,
                    };
                } catch (error) {
                    console.warn("place-enrichment-queue-failed", {
                        placeId,
                        error: error instanceof Error ? error.message : "unknown",
                    });
                    pendingCacheUpdatesRef.current[placeId] = {
                        ...(pendingCacheUpdatesRef.current[placeId] ?? {}),
                        status: "error",
                    };
                } finally {
                    enrichmentInFlightRef.current.delete(placeId);
                }

                batchedUpdates += 1;
                if (batchedUpdates >= ENRICHMENT_FLUSH_BATCH_SIZE) {
                    flushPendingCacheUpdates();
                    batchedUpdates = 0;
                }

                await new Promise((resolve) => setTimeout(resolve, ENRICH_DELAY_MS));
            }

            flushPendingCacheUpdates();
            enrichmentProcessingRef.current = false;
        },
        [enrichPlaceMutation.mutateAsync],
    );

    useEffect(() => {
        selectedBusinessIdRef.current = selectedBusinessId;
    }, [selectedBusinessId]);

    useEffect(() => {
        return () => {
            if (searchCooldownTimerRef.current !== null) {
                window.clearTimeout(searchCooldownTimerRef.current);
            }
        };
    }, []);

    useEffect(() => {
        if (tab !== "search") {
            setIsEnrichmentRunning(false);
            return;
        }
        if (businesses.length === 0) {
            if (isLoading) {
                return;
            }
            enrichmentQueueRef.current = [];
            hydratedPlaceIdsKeyRef.current = "";
            setIsEnrichmentRunning(false);
            return;
        }

        const placeIds = Array.from(
            new Set(businesses.map((business) => business.id)),
        ).sort((leftId, rightId) => leftId.localeCompare(rightId));
        const placeIdsKey = placeIds.join("|");
        if (hydratedPlaceIdsKeyRef.current === placeIdsKey) {
            return;
        }
        hydratedPlaceIdsKeyRef.current = placeIdsKey;

        const sessionId = enrichmentSessionRef.current + 1;
        enrichmentSessionRef.current = sessionId;
        enrichmentQueueRef.current = [];
        enrichmentInFlightRef.current.clear();
        enrichmentProcessingRef.current = false;
        pendingCacheUpdatesRef.current = {};

        setPlaceDetailsCache((prev) => {
            let changed = false;
            const next: Record<string, PlaceDetailsCacheEntry> = { ...prev };
            for (const placeId of placeIds) {
                if (next[placeId]) continue;
                changed = true;
                next[placeId] = { status: "idle" };
            }
            return changed ? next : prev;
        });

        const hydrateFromCache = async () => {
            const countPendingFromItems = (
                items: Record<
                    string,
                    {
                        isFresh: boolean;
                    }
                >,
            ) => placeIds.filter((placeId) => !items[placeId]?.isFresh).length;

            const pollPendingProgress = async (attempt = 1, startedAt = Date.now()) => {
                if (sessionId !== enrichmentSessionRef.current) return;
                if (Date.now() - startedAt > ENRICHMENT_STATUS_POLL_MAX_MS) {
                    setIsEnrichmentRunning(false);
                    return;
                }
                try {
                    const latest = await utils.places.cacheByIds.fetch({ placeIds });
                    if (sessionId !== enrichmentSessionRef.current) return;
                    const latestItems = latest.items as Record<
                        string,
                        {
                            website?: string | null;
                            phone?: string | null;
                            hasWebsite?: boolean | null;
                            status: "done" | "error";
                            isFresh: boolean;
                            lastFetchedAt?: Date | null;
                        }
                    >;
                    const pendingCount = countPendingFromItems(latestItems);
                    setIsEnrichmentRunning(pendingCount > 0);
                    if (pendingCount === 0) {
                        setPlaceDetailsCache((prev) => {
                            let changed = false;
                            const next = { ...prev };
                            for (const placeId of placeIds) {
                                const item = latestItems[placeId];
                                if (!item) continue;
                                const nextEntry: PlaceDetailsCacheEntry = {
                                    status: item.status === "error" ? "error" : "done",
                                    website: item.website ?? null,
                                    phone: item.phone ?? null,
                                    hasWebsite: item.hasWebsite ?? null,
                                    lastFetchedAt: item.lastFetchedAt ?? null,
                                };
                                if (!areCacheEntriesEqual(prev[placeId], nextEntry)) {
                                    next[placeId] = nextEntry;
                                    changed = true;
                                }
                            }
                            return changed ? next : prev;
                        });
                        return;
                    }
                    const nextDelayMs = attempt <= 10 ? 1500 : 3000;
                    window.setTimeout(() => {
                        void pollPendingProgress(attempt + 1, startedAt);
                    }, nextDelayMs);
                } catch {
                    if (attempt >= 10) {
                        setIsEnrichmentRunning(false);
                        return;
                    }
                    window.setTimeout(() => {
                        void pollPendingProgress(attempt + 1, startedAt);
                    }, 3000);
                }
            };

            try {
                const response = await utils.places.cacheByIds.fetch({ placeIds });
                if (sessionId !== enrichmentSessionRef.current) return;

                const items = response.items as Record<
                    string,
                    {
                        website?: string | null;
                        phone?: string | null;
                        hasWebsite?: boolean | null;
                        status: "done" | "error";
                        isFresh: boolean;
                        lastFetchedAt?: Date | null;
                    }
                >;

                const staleOrMissingIds: string[] = [];
                setPlaceDetailsCache((prev) => {
                    let changed = false;
                    const next = { ...prev };

                    for (const placeId of placeIds) {
                        const item = items[placeId];
                        if (!item) {
                            if (!next[placeId]) {
                                next[placeId] = { status: "idle" };
                                changed = true;
                            }
                            staleOrMissingIds.push(placeId);
                            continue;
                        }

                        const nextEntry: PlaceDetailsCacheEntry = {
                            status: item.status === "error" ? "error" : "done",
                            website: item.website ?? null,
                            phone: item.phone ?? null,
                            hasWebsite: item.hasWebsite ?? null,
                            lastFetchedAt: item.lastFetchedAt ?? null,
                        };

                        if (!areCacheEntriesEqual(prev[placeId], nextEntry)) {
                            next[placeId] = nextEntry;
                            changed = true;
                        }
                        if (!item.isFresh) {
                            staleOrMissingIds.push(placeId);
                        }
                    }

                    return changed ? next : prev;
                });

                const visibleIds = getVisiblePlaceIds(staleOrMissingIds);
                const selectedId = selectedBusinessIdRef.current;
                const selectedIds = selectedId
                    ? staleOrMissingIds.includes(selectedId)
                        ? [selectedId]
                        : []
                    : [];
                const remainingIds = staleOrMissingIds.filter(
                    (placeId) =>
                        !selectedIds.includes(placeId) && !visibleIds.includes(placeId),
                );
                setIsEnrichmentRunning(staleOrMissingIds.length > 0);
                if (staleOrMissingIds.length > 0) {
                    void pollPendingProgress();
                }

                enrichmentQueueRef.current = [
                    ...selectedIds,
                    ...visibleIds,
                    ...remainingIds,
                ];
                // Enrichment is refreshed server-side in cacheByIds.
                // Avoid client-side per-item enrichment updates to keep map markers stable.
            } catch (error) {
                console.warn("place-enrichment-cache-bootstrap-failed", {
                    error: error instanceof Error ? error.message : "unknown",
                });
                const visibleIds = getVisiblePlaceIds(placeIds);
                const selectedId = selectedBusinessIdRef.current;
                const selectedIds = selectedId
                    ? placeIds.includes(selectedId)
                        ? [selectedId]
                        : []
                    : [];
                const remainingIds = placeIds.filter(
                    (placeId) =>
                        !selectedIds.includes(placeId) && !visibleIds.includes(placeId),
                );
                setIsEnrichmentRunning(false);
                enrichmentQueueRef.current = [
                    ...selectedIds,
                    ...visibleIds,
                    ...remainingIds,
                ];
                // Enrichment is refreshed server-side in cacheByIds.
                // Avoid client-side per-item enrichment updates to keep map markers stable.
            }
        };

        void hydrateFromCache();
    }, [businesses, getVisiblePlaceIds, isLoading, tab, utils]);

    useEffect(() => {
        void utils.leads.getAll.prefetch();
    }, [utils]);

    useEffect(() => {
        if (!hasSearched || searchQueryEnabled || !lat || !lng) return;
        void utils.places.nearby.prefetch({ lat, lng, radius, limit: resultLimit });
    }, [hasSearched, searchQueryEnabled, lat, lng, radius, resultLimit, utils]);

    const panMapTo = useCallback((nextLat: number, nextLng: number, nextZoom?: number) => {
        isZoomingToMarker.current = true;
        mapViewportRef.current.center = [nextLat, nextLng];
        if (typeof nextZoom === "number" && mapRef.current?.flyTo) {
            mapRef.current.flyTo([nextLat, nextLng], nextZoom, {
                animate: true,
                duration: 0.5,
            });
            return;
        }
        if (!mapRef.current?.panTo) return;
        mapRef.current.panTo([nextLat, nextLng], {
            animate: true,
            duration: 0.35,
            easeLinearity: 0.25,
        });
    }, []);

    // Handle selecting a lead
    const handleLeadSelect = useCallback(
        (lead: SavedLead) => {
            setSelectedLeadId(lead.id);
            setSelectedIdx(null);
            setSelectedBusinessId(lead.placeId);
            setLeadNotes(lead.notes || "");
            setLeadStatus((lead.status as LeadStatus) || "new");
            setLeadScore(lead.score ?? 0);

            if (lead.lat && lead.lng) {
                setLat(lead.lat);
                setLng(lead.lng);
                panMapTo(lead.lat, lead.lng, MIN_FOCUS_ZOOM);
            }
        },
        [
            panMapTo,
            setSelectedLeadId,
            setSelectedIdx,
            setSelectedBusinessId,
            setLat,
            setLng,
        ],
    );

    useEffect(() => {
        if (selectedIdx === null || selectedBusinessId) return;
        const business = businesses[selectedIdx];
        if (!business) return;
        setSelectedBusinessId(business.id);
    }, [businesses, selectedBusinessId, selectedIdx]);

    useEffect(() => {
        if (!selectedBusinessId) return;
        const activeIndex = businesses.findIndex((business) => business.id === selectedBusinessId);
        void setSelectedIdx(activeIndex >= 0 ? activeIndex : null);
    }, [businesses, selectedBusinessId, setSelectedIdx]);

    // Scroll to selected item
    useEffect(() => {
        if (!selectedBusinessId || !listRef.current) return;
        const selectedElement = listRef.current.querySelector<HTMLElement>(
            `[data-business-id="${selectedBusinessId}"]`,
        );
        if (!selectedElement) return;
        selectedElement.scrollIntoView({ behavior: "smooth", block: "center" });
    }, [selectedBusinessId, businesses, filterMinRating, filterHasWebsite]);

    // Handle selecting a business from list or map
    const handleBusinessSelectFromMap = useCallback(
        (businessId: string, options?: { lightweight?: boolean }) => {
            const idx = businesses.findIndex((candidate) => candidate.id === businessId);
            if (idx < 0) return;
            const business = businesses[idx];
            if (!business) return;

            setSelectedBusinessId(business.id);
            setSelectedLeadId(null);

            if (business.lat !== 0 && business.lng !== 0) {
                panMapTo(
                    business.lat,
                    business.lng,
                    options?.lightweight ? undefined : Math.max(mapZoom, MIN_FOCUS_ZOOM),
                );
            }
        },
        [businesses, mapZoom, panMapTo, setSelectedBusinessId, setSelectedLeadId],
    );

    const closeDetail = () => {
        setSelectedLeadId(null);
        setSelectedBusinessId(null);
    };

    const handleSaveBusiness = useCallback(
        (detailBusiness: DisplayBusiness) => {
            createLeadMutation.mutate({
                placeId: detailBusiness.id,
                name: detailBusiness.name,
                address: detailBusiness.address,
                area: detailBusiness.area ?? undefined,
                lat: detailBusiness.lat ?? undefined,
                lng: detailBusiness.lng ?? undefined,
                rating: detailBusiness.rating ?? undefined,
                reviewCount: detailBusiness.userRatingsTotal ?? undefined,
                types: detailBusiness.types?.join(",") ?? undefined,
                website: detailBusiness.website ?? undefined,
                phone: detailBusiness.phone ?? undefined,
            });
        },
        [createLeadMutation],
    );

    const handleUpdateLead = () => {
        if (!selectedLeadId) return;

        updateLeadMutation.mutate({
            id: selectedLeadId,
            notes: leadNotes,
            status: leadStatus,
            score: leadScore,
        });
    };

    const handleDeleteLead = (id: string) => {
        if (confirm("Are you sure you want to delete this lead?")) {
            deleteLeadMutation.mutate({ id });
            closeDetail();
        }
    };

    const handleSearchThisArea = useCallback((center: [number, number]) => {
        if (isSearchCooldown) return;
        const [nextLat, nextLng] = center;
        setLat(nextLat);
        setLng(nextLng);
        setHasSearched(true);
        setIsSearchCooldown(true);
        if (searchCooldownTimerRef.current !== null) {
            window.clearTimeout(searchCooldownTimerRef.current);
        }
        searchCooldownTimerRef.current = window.setTimeout(() => {
            setIsSearchCooldown(false);
            searchCooldownTimerRef.current = null;
        }, SEARCH_AREA_COOLDOWN_MS);
    }, [isSearchCooldown, setLat, setLng]);

    const handleToggleRadius = useCallback(() => {
        setShowRadius((prev) => !prev);
    }, []);
    const handleToggleEnrichmentDebug = useCallback(() => {
        setShowEnrichmentDebug((previous) => !previous);
    }, []);

    const handleClearSearchAndFilters = useCallback(() => {
        setSearchInput("");
        void setSearchQuery("");
        setFilterMinRating(0);
        setFilterHasWebsite(null);
        setRadius(DEFAULT_RADIUS_METERS);
        setResultLimit(DEFAULT_RESULT_LIMIT);
        setSelectedBusinessId(null);
    }, [setSearchQuery, setSelectedBusinessId]);

    const handleLocateFound = useCallback(
        (e: any) => {
            const { lat: newLat, lng: newLng } = e.latlng;
            setLat(newLat);
            setLng(newLng);
            setZoom(14);
            setMapCenter([newLat, newLng]);
            setRadiusCenter([newLat, newLng]);
            setMapZoom(14);
        },
        [setLat, setLng, setZoom],
    );

    const handleMapMoveEnd = useCallback(
        (nextCenter: [number, number], nextZoom: number) => {
            mapViewportRef.current = { center: nextCenter, zoom: nextZoom };
            setMapZoom(Math.round(nextZoom));
            void setZoom(Math.round(nextZoom));
        },
        [setZoom],
    );

    useEffect(() => {
        setLeadPage(1);
    }, [leadSearchTerm, leadStatusFilter, leadSort]);

    const calculateScore = () => {
        if (!selectedLead) return;

        let score = 0;
        const target = selectedLead;

        if (target.rating) score += Math.min(target.rating * 4, 20);
        if (target.website) score += 10;
        if (target.phone) score += 5;

        setLeadScore(score);
    };

    const handleCopyOutreach = useCallback(async () => {
        const targetLead = savedLeads.find((lead) => lead.id === selectedLeadId);
        if (!targetLead) return;
        const outreachTemplate = [
            `Hi ${targetLead.name},`,
            "",
            "I came across your business and noticed some opportunities to improve lead generation.",
            "Would you be open to a quick 15-minute chat this week?",
            "",
            "Best regards,",
        ].join("\n");

        try {
            await navigator.clipboard.writeText(outreachTemplate);
            toast.success("Outreach message copied");
        } catch (error) {
            console.error("copy-outreach-failed", error);
            toast.error("Could not copy outreach message");
        }
    }, [savedLeads, selectedLeadId]);

    const handleExportCsv = () => {
        if (!savedLeads || savedLeads.length === 0) return;

        const headers = [
            "Name",
            "Address",
            "Area",
            "Rating",
            "Website",
            "Phone",
            "Status",
            "Score",
            "Notes",
        ];

        const csv = [
            headers.join(","),
            ...savedLeads.map((lead) =>
                [
                    lead.name,
                    lead.address ?? "",
                    lead.area ?? "",
                    lead.rating ?? "",
                    lead.website ?? "",
                    lead.phone ?? "",
                    lead.status ?? "",
                    lead.score ?? "",
                    lead.notes ?? "",
                ]
                    .map((value) => `"${String(value).replace(/"/g, '""')}"`)
                    .join(","),
            ),
        ].join("\n");

        const blob = new Blob([csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `leads-${new Date().toISOString().split("T")[0]}.csv`;
        anchor.click();
        URL.revokeObjectURL(url);
    };

    // Get selected lead data
    const selectedLead = useMemo(
        () => savedLeads?.find((l) => l.id === selectedLeadId) ?? null,
        [savedLeads, selectedLeadId],
    );

    // Display businesses on map
    const displayBusinesses = useMemo(
        () =>
            tab === "leads" && savedLeads
                ? savedLeads.map((lead) => ({
                    id: lead.placeId,
                    name: lead.name,
                    address: lead.address ?? "",
                    area: lead.area,
                    lat: lead.lat ?? 0,
                    lng: lead.lng ?? 0,
                    rating: lead.rating ?? undefined,
                    website: lead.website ?? undefined,
                    phone: lead.phone ?? undefined,
                    userRatingsTotal: lead.reviewCount ?? undefined,
                    businessStatus: lead.googleBusinessStatus ?? undefined,
                    priceLevel: lead.googlePriceLevel ?? undefined,
                }))
                : businesses,
        [tab, savedLeads, businesses],
    );

    const distanceOrigin = useMemo<[number, number] | null>(
        () =>
            typeof lat === "number" && typeof lng === "number"
                ? [lat, lng]
                : null,
        [lat, lng],
    );

    // Add types to displayBusinesses for saved leads (ensure all have types)
    const displayBusinessesWithTypes = useMemo<DisplayBusiness[]>(
        () =>
            (displayBusinesses as Business[]).map((b) => ({
                ...b,
                _types: b.types ?? [],
                _userRatingsTotal: b.userRatingsTotal ?? 0,
                _distanceKm:
                    distanceOrigin && b.lat && b.lng
                        ? calculateDistanceKm(distanceOrigin, [b.lat, b.lng])
                        : undefined,
                _contactabilityScore: getContactabilityScore(b),
            })),
        [displayBusinesses, distanceOrigin],
    );

    // Apply filters
    const filteredBusinesses = useMemo(
        () =>
            displayBusinessesWithTypes.filter((b) => {
                const resolvedHasWebsite =
                    tab === "search"
                        ? (placeDetailsCache[b.id]?.hasWebsite ??
                            (typeof b.website === "string" ? true : undefined))
                        : Boolean(b.website);
                if (filterMinRating > 0 && (b.rating ?? 0) < filterMinRating) {
                    return false;
                }
                if (filterHasWebsite === true && resolvedHasWebsite !== true) return false;
                if (filterHasWebsite === false && resolvedHasWebsite !== false) return false;
                return true;
            }),
        [displayBusinessesWithTypes, filterMinRating, filterHasWebsite, placeDetailsCache, tab],
    );

    const mappableBusinesses = useMemo(
        () => filteredBusinesses.filter((business) => business.lat && business.lng),
        [filteredBusinesses],
    );
    const enrichedMarkerBusinesses = useMemo(
        () =>
            enrichedMarkers.map((marker: {
                placeId: string;
                name: string;
                lat: number;
                lng: number;
                website?: string | null;
                phone?: string | null;
                hasWebsite?: boolean | null;
            }) => ({
                id: marker.placeId,
                name: marker.name,
                address: "",
                area: null,
                lat: marker.lat,
                lng: marker.lng,
                website: marker.website ?? undefined,
                phone: marker.phone ?? undefined,
                hasWebsite: marker.hasWebsite ?? undefined,
                _types: [],
                _userRatingsTotal: 0,
            }) satisfies DisplayBusiness),
        [enrichedMarkers],
    );

    const leadsByPlaceId = useMemo(
        () => new globalThis.Map((savedLeads ?? []).map((lead) => [lead.placeId, lead])),
        [savedLeads],
    );
    const savedLeadPlaceIds = useMemo(
        () => new Set((savedLeads ?? []).map((lead) => lead.placeId)),
        [savedLeads],
    );

    const handleMarkerClick = useCallback(
        (businessId: string) => {
            if (tab === "search") {
                return;
            }

            const lead = leadsByPlaceId.get(businessId);
            if (lead) handleLeadSelect(lead);
        },
        [tab, leadsByPlaceId, handleLeadSelect],
    );

    return (
        <div className="relative flex h-[calc(100svh-var(--header-height))] overflow-hidden">
            {/* Left Panel */}
            <div className="flex h-full w-[325px] min-w-[300px] flex-col border-r">
                <Tabs
                    value={tab}
                    onValueChange={(value) => {
                        setTab(value);
                        if (value === "leads") {
                            setSelectedIdx(null);
                            setSelectedBusinessId(null);
                        }
                    }}
                    className="h-full p-2"
                >
                    <TabsList className="w-full">
                        <TabsTrigger
                            value="search"
                            className="flex-1"
                            onPointerEnter={() => {
                                if (hasSearched && !searchQueryEnabled && lat && lng) {
                                    void utils.places.nearby.prefetch({
                                        lat,
                                        lng,
                                        radius,
                                        limit: resultLimit,
                                    });
                                }
                            }}
                        >
                            <Search />
                            Search
                        </TabsTrigger>
                        <TabsTrigger
                            value="leads"
                            className="flex-1"
                            onPointerEnter={() => {
                                void utils.leads.getAll.prefetch({
                                    page: leadPage,
                                    pageSize: leadPageSize,
                                    query: leadSearchTerm.trim() || undefined,
                                    status: leadStatusQuery,
                                    sort: leadSort,
                                });
                            }}
                        >
                            <List />
                            Saved Leads{" "}
                            {savedLeadsResponse?.total ? `(${savedLeadsResponse.total})` : ""}
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="search" className="min-h-0 flex-1 overflow-y-auto p-2">
                        <div className="flex flex-col gap-4">
                            <div className="flex gap-2">
                                <SearchInput
                                    value={searchInput}
                                    onChange={setSearchInput}
                                    isLoading={isLoading}
                                    resultCount={filteredBusinesses.length}
                                    onClearSearchAndFilters={handleClearSearchAndFilters}
                                />

                                <SearchFilter
                                    filterMinRating={filterMinRating}
                                    onMinRatingChange={setFilterMinRating}
                                    filterHasWebsite={filterHasWebsite}
                                    onHasWebsiteChange={setFilterHasWebsite}
                                    radius={radius}
                                    onRadiusChange={setRadius}
                                    resultLimit={resultLimit}
                                    onResultLimitChange={setResultLimit}
                                />
                            </div>

                            {(isLoading || locationLoading) &&
                                Array.from({ length: 5 }).map((_, index) => (
                                    <ListItemLoading key={index} />
                                ))}

                            {!isLoading && !locationLoading && (
                                <div className="flex flex-col gap-2" ref={listRef}>
                                    {filteredBusinesses.map((business) => (
                                        <ListItem
                                            key={business.id}
                                            onClick={() => handleBusinessSelectFromMap(business.id)}
                                            data={business}
                                            selected={selectedBusinessId === business.id}
                                        />
                                    ))}
                                </div>
                            )}

                            {!isLoading && !locationLoading && businesses.length === 0 && (
                                <div className="py-4 text-xs text-center text-muted-foreground">
                                    {normalizedSearchQuery.length > 0 && !searchQueryEnabled
                                        ? `Type at least ${MIN_SEARCH_CHARS} characters to search`
                                        : searchQueryEnabled
                                            ? "No results found"
                                            : "Loading nearby places..."}
                                </div>
                            )}
                        </div>
                    </TabsContent>

                    <TabsContent value="leads" className="min-h-0 flex-1 overflow-y-auto p-4">
                        <div className="mb-3 space-y-2">
                            <input
                                type="text"
                                value={leadSearchTerm}
                                onChange={(event) => setLeadSearchTerm(event.target.value)}
                                placeholder="Search saved leads..."
                                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                            />
                            <div className="grid grid-cols-2 gap-2">
                                <select
                                    value={leadStatusFilter}
                                    onChange={(event) =>
                                        setLeadStatusFilter(event.target.value as LeadStatus | "all")
                                    }
                                    className="rounded-md border bg-background px-2 py-2 text-sm"
                                >
                                    <option value="all">All statuses</option>
                                    {(Object.keys(STATUS_LABELS) as LeadStatus[]).map((statusKey) => (
                                        <option key={statusKey} value={statusKey}>
                                            {STATUS_LABELS[statusKey].label}
                                        </option>
                                    ))}
                                </select>
                                <select
                                    value={leadSort}
                                    onChange={(event) =>
                                        setLeadSort(event.target.value as "newest" | "score_desc")
                                    }
                                    className="rounded-md border bg-background px-2 py-2 text-sm"
                                >
                                    <option value="newest">Newest first</option>
                                    <option value="score_desc">Highest score</option>
                                </select>
                            </div>
                        </div>

                        <div className="mb-3 flex justify-between">
                            <p className="text-xs text-muted-foreground">
                                Showing {savedLeads.length} of {savedLeadsResponse?.total ?? 0}
                            </p>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={handleExportCsv}
                                disabled={!savedLeads?.length}
                            >
                                Export CSV
                            </Button>
                        </div>

                        <div className="flex flex-col gap-2" ref={listRef}>
                            {savedLeads.length > 0 ? (
                                savedLeads.map((lead) => (
                                    <button
                                        type="button"
                                        key={lead.id}
                                        onClick={() => handleLeadSelect(lead)}
                                        className={cn(
                                            "w-full rounded-2xl border p-3 text-left transition-colors hover:bg-accent",
                                            selectedLeadId === lead.id && "ring-2 ring-primary bg-accent",
                                        )}
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0 flex-1">
                                                <h3 className="font-medium">{lead.name}</h3>
                                                {lead.area && (
                                                    <p className="mt-1 text-xs text-muted-foreground">
                                                        {lead.area}
                                                    </p>
                                                )}
                                            </div>
                                            <div className="flex flex-col items-end gap-1">
                                                <Badge variant="secondary">
                                                    {STATUS_LABELS[lead.status as LeadStatus]?.label ?? "New"}
                                                </Badge>
                                                {lead.score !== null && lead.score > 0 && (
                                                    <span className="text-xs font-medium text-muted-foreground">
                                                        Score: {lead.score}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </button>
                                ))
                            ) : (
                                <div className="py-8 text-center text-muted-foreground">
                                    <p>No saved leads yet.</p>
                                    <p className="mt-2 text-sm">
                                        Search for businesses and save them as leads.
                                    </p>
                                </div>
                            )}
                        </div>
                        <div className="mt-4 flex items-center justify-between">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setLeadPage((page) => Math.max(page - 1, 1))}
                                disabled={leadPage === 1}
                            >
                                Previous
                            </Button>
                            <span className="text-xs text-muted-foreground">Page {leadPage}</span>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setLeadPage((page) => page + 1)}
                                disabled={!hasMoreLeads}
                            >
                                Next
                            </Button>
                        </div>
                    </TabsContent>
                </Tabs>
            </div>

            {/* Right Panel - Map */}
            <LeadMapPanel
                mapCenter={mapCenter}
                mapZoom={mapZoom}
                mapRef={mapRef}
                mapViewportRef={mapViewportRef}
                isZoomingToMarker={isZoomingToMarker}
                hasSearched={hasSearched}
                searchQueryEnabled={searchQueryEnabled}
                showRadius={showRadius}
                radius={radius}
                radiusCenter={radiusCenter}
                mappableBusinesses={mappableBusinesses}
                enrichedMarkerBusinesses={enrichedMarkerBusinesses}
                selectedBusinessId={selectedBusinessId}
                savedLeadPlaceIds={savedLeadPlaceIds}
                placeDetailsCache={placeDetailsCache}
                isSearchTab={tab === "search"}
                isLoadingNearby={isLoadingNearby}
                isSearchCooldown={isSearchCooldown}
                showEnrichmentDebug={showEnrichmentDebug}
                isEnrichmentRunning={isEnrichmentRunning}
                onToggleRadius={handleToggleRadius}
                onToggleEnrichmentDebug={handleToggleEnrichmentDebug}
                onSearchThisArea={handleSearchThisArea}
                onLocateFound={handleLocateFound}
                onMarkerClick={handleMarkerClick}
                onSaveBusiness={handleSaveBusiness}
                onMapMoveEnd={handleMapMoveEnd}
            />

            {/* Detail Sidebar - for Saved Leads */}
            {selectedLead && (
                <div className="absolute top-0 right-0 z-9999 h-full w-[420px] animate-in slide-in-from-right-10 overflow-y-auto bg-white shadow-xl">
                    <div className="p-4 border-b flex items-center justify-between bg-background sticky top-0">
                        <h2 className="text-lg font-semibold">Lead Qualification</h2>
                        <Button onClick={closeDetail} variant="ghost" size="icon">
                            <X />
                        </Button>
                    </div>

                    <div className="p-4 bg-background space-y-6">
                        {/* Lead Info */}
                        <div className="bg-muted/30 p-4 rounded-lg space-y-3">
                            <h3 className="font-semibold text-lg">{selectedLead.name}</h3>
                            {selectedLead.rating && (
                                <div className="flex items-center gap-2">
                                    <div className="flex">
                                        {[1, 2, 3, 4, 5].map((star) => (
                                            <Star
                                                key={star}
                                                className={`w-4 h-4 ${star <= Math.round(selectedLead.rating!) ? "fill-yellow-500 text-yellow-500" : "text-muted-foreground"}`}
                                            />
                                        ))}
                                    </div>
                                    <span className="text-sm font-medium">
                                        {selectedLead.rating}
                                    </span>
                                </div>
                            )}
                            <div className="space-y-2 text-sm">
                                {selectedLead.area && (
                                    <div className="flex items-center gap-2">
                                        <span className="text-muted-foreground">Area:</span>
                                        <span>{selectedLead.area}</span>
                                    </div>
                                )}
                                {selectedLead.address && (
                                    <div className="flex items-center gap-2">
                                        <span className="text-muted-foreground">Address:</span>
                                        <span className="line-clamp-2">{selectedLead.address}</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Contact */}
                        <div className="space-y-3">
                            <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                                Contact
                            </h4>
                            <div className="flex flex-wrap gap-2">
                                {selectedLead.website && (
                                    <a
                                        href={selectedLead.website}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-2 px-3 py-2 bg-blue-50 text-blue-700 rounded-lg text-sm hover:bg-blue-100"
                                    >
                                        <Globe className="w-4 h-4" />
                                        Website
                                    </a>
                                )}

                                {selectedLead.phone && (
                                    <a
                                        href={`tel:${selectedLead.phone}`}
                                        className="flex items-center gap-2 px-3 py-2 bg-green-50 text-green-700 rounded-lg text-sm hover:bg-green-100"
                                    >
                                        <Phone className="w-4 h-4" />
                                        Call
                                    </a>
                                )}
                            </div>
                        </div>

                        {/* Lead Score */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                                    Lead Score
                                </h4>
                                <Button onClick={calculateScore} variant="link" size="xs">
                                    Calculate
                                </Button>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
                                    <div
                                        className={`h-full rounded-full ${leadScore >= 60 ? "bg-green-500" : leadScore >= 40 ? "bg-yellow-500" : "bg-red-500"}`}
                                        style={{ width: `${leadScore}%` }}
                                    />
                                </div>
                                <span className="text-lg font-bold">{leadScore}/100</span>
                            </div>
                        </div>

                        {/* Status */}
                        <div className="space-y-3">
                            <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                                Status
                            </h4>
                            <div className="flex flex-wrap gap-2">
                                {(Object.keys(STATUS_LABELS) as LeadStatus[]).map((status) => (
                                    <Button
                                        key={status}
                                        onClick={() => setLeadStatus(status)}
                                        size="xs"
                                        variant={leadStatus === status ? "default" : "outline"}
                                    >
                                        {STATUS_LABELS[status].label}
                                    </Button>
                                ))}
                            </div>
                        </div>

                        {/* Notes */}
                        <div className="space-y-3">
                            <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                                Notes
                            </h4>
                            <Textarea
                                value={leadNotes}
                                onChange={(e) => setLeadNotes(e.target.value)}
                                placeholder="Add observations... (e.g., weak hero, no clear CTA)"
                                className="min-h-24"
                            />
                        </div>

                        {/* Actions */}
                        <div className="space-y-2 pt-4">
                            <Separator />
                            <Button
                                onClick={handleUpdateLead}
                                disabled={updateLeadMutation.isPending}
                                className="w-full"
                            >
                                {updateLeadMutation.isPending ? "Saving..." : "Update Lead"}
                            </Button>
                            <div className="grid grid-cols-2 gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => {
                                        void handleCopyOutreach();
                                    }}
                                >
                                    Copy Outreach
                                </Button>
                                <Button
                                    variant="destructive"
                                    onClick={() => handleDeleteLead(selectedLead.id)}
                                >
                                    <Trash2 />
                                    Delete
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function DashboardPage() {
    return (
        <Suspense fallback={<div className="p-4">Loading...</div>}>
            <LeadPageContent />
        </Suspense>
    );
}
