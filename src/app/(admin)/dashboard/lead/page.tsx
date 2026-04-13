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
} from "~/components/ui/map";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Separator } from "~/components/ui/separator";
import { Spinner } from "~/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { Textarea } from "~/components/ui/textarea";
import { api } from "~/trpc/react";
import { cn } from "~/lib/utils";
import ListItem from "~/components/search/list-item";
import SearchInput from "~/components/search/input";
import SearchFilter from "~/components/search/filter";
import {
    MARKER_SIGNAL,
    STATUS_LABELS,
    type Business,
    type DisplayBusiness,
    type LeadStatus,
    type SavedLead,
} from "./types";
import ListItemLoading from "~/components/search/list-item-loading";

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
    isLoadingNearby: boolean;
    onToggleRadius: () => void;
    onSearchThisArea: () => void;
    onLocateFound: (e: any) => void;
    onMarkerClick: (businessId: string) => void;
    onSaveBusiness: (business: DisplayBusiness) => void;
    onRadiusCenterChange: (center: [number, number]) => void;
}

interface MapMarkersLayerProps {
    mappableBusinesses: DisplayBusiness[];
    onMarkerClick: (businessId: string) => void;
    onSaveBusiness: (business: DisplayBusiness) => void;
}

const MapMarkersLayer = memo(function MapMarkersLayer({
    mappableBusinesses,
    onMarkerClick,
    onSaveBusiness,
}: MapMarkersLayerProps) {
    return (
        <MapMarkerClusterGroup>
            {mappableBusinesses.map((business) => (
                <MapMarker
                    key={business.id}
                    position={[business.lat, business.lng]}
                    iconAnchor={[20, 20]}
                    eventHandlers={{
                        click: () => onMarkerClick(business.id),
                    }}
                >
                    <MapTooltip side="top">{business.name}</MapTooltip>
                    <MapPopup className="w-64">
                        <div className="space-y-1.5">
                            <p className="font-medium leading-tight">{business.name}</p>
                            <p className="text-muted-foreground text-xs leading-snug">
                                {business.address}
                            </p>
                            <div className="text-muted-foreground flex items-center gap-2 text-xs">
                                <span>
                                    Rating:{" "}
                                    {business.rating ? business.rating.toFixed(1) : "N/A"}
                                </span>
                                <span>
                                    Website: {business.website ? "Yes" : "No"}
                                </span>
                            </div>
                            <Button
                                type="button"
                                size="xs"
                                className="w-full"
                                onClick={() => onSaveBusiness(business)}
                            >
                                <Plus />
                                Save as Lead
                            </Button>
                        </div>
                    </MapPopup>
                </MapMarker>
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
    isLoadingNearby,
    onToggleRadius,
    onSearchThisArea,
    onLocateFound,
    onMarkerClick,
    onSaveBusiness,
    onRadiusCenterChange,
}: LeadMapPanelProps) {
    return (
        <div className="relative h-full flex-1">
            <Map center={mapCenter} zoom={mapZoom} ref={mapRef} className="h-full w-full">
                <MapTileLayer />
                <MapMoveHandler
                    onMoveEnd={(center, zoom) => {
                        mapViewportRef.current = { center, zoom };
                        if (isZoomingToMarker.current) {
                            isZoomingToMarker.current = false;
                            return;
                        }
                    }}
                />

                {hasSearched && !searchQueryEnabled && showRadius && (
                    <MapCircle
                        center={radiusCenter}
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
                        position={radiusCenter}
                        draggable
                        iconAnchor={[16, 16]}
                        icon={
                            <div className="flex size-8 items-center justify-center rounded-full border-2 border-blue-600 bg-white shadow-md">
                                <LocateFixed className="size-4 text-blue-600" />
                            </div>
                        }
                        eventHandlers={{
                            dragend: ((event: any) => {
                                const { lat, lng } = event.target.getLatLng();
                                onRadiusCenterChange([lat, lng]);
                            }) as unknown as () => void,
                        }}
                    >
                        <MapTooltip side="top">Drag search center</MapTooltip>
                    </MapMarker>
                )}

                <MapMarkersLayer
                    mappableBusinesses={mappableBusinesses}
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
                </div>

                <MapControlContainer className="bg-popover text-popover-foreground bottom-1 left-1 flex flex-col gap-2 rounded-md border p-2 shadow m-2">
                    {Object.keys(MARKER_SIGNAL)
                        .filter((s) => s !== "selected")
                        .map((status) => (
                            <div key={status} className="flex items-center gap-2">
                                <div
                                    className={cn(
                                        "w-3 h-3 rounded-full",
                                        MARKER_SIGNAL[status as keyof typeof MARKER_SIGNAL],
                                    )}
                                />
                                <span className="text-xs capitalize">
                                    {status === "noWebsite"
                                        ? "No Website"
                                        : status === "hasWebsite"
                                            ? "Has Website"
                                            : "Pending"}
                                </span>
                            </div>
                        ))}
                </MapControlContainer>

                {!searchQueryEnabled && (
                    <Button
                        type="button"
                        onClick={onSearchThisArea}
                        disabled={isLoadingNearby}
                        className="absolute top-4 left-1/2 z-1000 -translate-x-1/2 rounded-full shadow-lg"
                    >
                        {isLoadingNearby ? <Spinner /> : <MapPin />}
                        {isLoadingNearby ? "Searching..." : "Search This Area"}
                    </Button>
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
    const [selectedLeadId, setSelectedLeadId] = useQueryState(
        "lead",
        parseAsString,
    );
    const [lat, setLat] = useQueryState("lat", parseAsFloat.withDefault(40.7128));
    const [lng, setLng] = useQueryState("lng", parseAsFloat.withDefault(-74.006));
    const [zoom, setZoom] = useQueryState("z", parseAsInteger.withDefault(14));

    // Local map state (separate from URL, used for smooth panning)
    const [mapCenter, setMapCenter] = useState<[number, number]>([
        lat ?? 40.7128,
        lng ?? -74.006,
    ]);
    const [mapZoom, setMapZoom] = useState(zoom ?? 14);
    const [radius, setRadius] = useState(5000);
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

    // Fetch saved leads
    const { data: savedLeads, refetch: refetchLeads } = api.leads.getAll.useQuery(
        undefined,
        {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
        },
    );

    const createLeadMutation = api.leads.create.useMutation({
        onSuccess: () => refetchLeads(),
    });
    const deleteLeadMutation = api.leads.delete.useMutation({
        onSuccess: () => refetchLeads(),
    });
    const updateLeadMutation = api.leads.update.useMutation({
        onSuccess: () => refetchLeads(),
    });

    // Local state for selected saved lead detail panel
    const [leadNotes, setLeadNotes] = useState("");
    const [leadStatus, setLeadStatus] = useState<LeadStatus>("new");
    const [leadScore, setLeadScore] = useState(0);

    // Manual trigger for nearby search
    const [hasSearched, setHasSearched] = useState(false);
    const [locationLoading, setLocationLoading] = useState(false);

    // Filters
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [filterMinRating, setFilterMinRating] = useState<number>(0);
    const [filterHasWebsite, setFilterHasWebsite] = useState<boolean | null>(
        null,
    );
    const [resultLimit, setResultLimit] = useState(20);

    // Derived values
    const searchQueryEnabled = searchQuery.trim().length > 0;

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
                enabled: searchQueryEnabled && searchQuery.trim().length > 1,
                staleTime: 30_000,
                refetchOnWindowFocus: false,
            },
        );

    const { data: nearbyResults, isLoading: isLoadingNearby } =
        api.places.nearby.useQuery(
            { lat, lng, radius, limit: resultLimit },
            {
                enabled: !searchQueryEnabled && hasSearched && !!lat && !!lng,
                staleTime: 30_000,
                refetchOnWindowFocus: false,
            },
        );

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
            website: place.website,
            phone: place.phone,
        }));
    }, [searchQueryEnabled, searchResults, nearbyResults]);

    const isLoading = searchQueryEnabled ? isSearching : isLoadingNearby;

    useEffect(() => {
        void utils.leads.getAll.prefetch();
    }, [utils]);

    useEffect(() => {
        if (!hasSearched || searchQueryEnabled || !lat || !lng) return;
        void utils.places.nearby.prefetch({ lat, lng, radius, limit: resultLimit });
    }, [hasSearched, searchQueryEnabled, lat, lng, radius, resultLimit, utils]);

    const panMapTo = useCallback((nextLat: number, nextLng: number) => {
        isZoomingToMarker.current = true;
        mapViewportRef.current.center = [nextLat, nextLng];
        if (mapRef.current?.panTo) {
            mapRef.current.panTo([nextLat, nextLng], {
                animate: true,
                duration: 0.35,
                easeLinearity: 0.25,
            });
        }
    }, []);

    // Handle selecting a lead
    const handleLeadSelect = useCallback(
        (lead: SavedLead) => {
            setSelectedLeadId(lead.id);
            setSelectedIdx(null);
            setLeadNotes(lead.notes || "");
            setLeadStatus((lead.status as LeadStatus) || "new");
            setLeadScore(lead.score ?? 0);

            if (lead.lat && lead.lng) {
                setLat(lead.lat);
                setLng(lead.lng);
                panMapTo(lead.lat, lead.lng);
            }
        },
        [
            panMapTo,
            setSelectedLeadId,
            setSelectedIdx,
            setLat,
            setLng,
        ],
    );

    // Scroll to selected item
    useCallback(() => {
        if (selectedIdx !== null && listRef.current) {
            const element = listRef.current.children[selectedIdx] as HTMLElement;
            if (element) {
                element.scrollIntoView({ behavior: "smooth", block: "center" });
            }
        }
    }, [selectedIdx]);

    // Handle selecting a business from map click
    const handleBusinessSelectFromMap = useCallback(
        (index: number) => {
            const business = businesses[index];
            if (!business) return;

            setSelectedIdx(index);
            setSelectedLeadId(null);

            if (business.lat !== 0 && business.lng !== 0) {
                panMapTo(business.lat, business.lng);
            }
        },
        [businesses, panMapTo, setSelectedIdx, setSelectedLeadId],
    );

    const closeDetail = () => {
        setSelectedLeadId(null);
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

    const handleSearchThisArea = useCallback(() => {
        const [nextLat, nextLng] = radiusCenter;
        setLat(nextLat);
        setLng(nextLng);
        setHasSearched(true);
    }, [radiusCenter, setLat, setLng]);

    const handleToggleRadius = useCallback(() => {
        setShowRadius((prev) => !prev);
    }, []);

    const handleClearSearchAndFilters = useCallback(() => {
        setSearchInput("");
        void setSearchQuery("");
        setFilterMinRating(0);
        setFilterHasWebsite(null);
        setRadius(5000);
        setResultLimit(20);
        setFiltersOpen(false);
    }, [setSearchQuery]);

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

    const calculateScore = () => {
        if (!selectedLead) return;

        let score = 0;
        const target = selectedLead;

        if (target.rating) score += Math.min(target.rating * 4, 20);
        if (target.website) score += 10;
        if (target.phone) score += 5;

        setLeadScore(score);
    };

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
                    id: lead.id,
                    name: lead.name,
                    address: lead.address ?? "",
                    area: lead.area,
                    lat: lead.lat ?? 0,
                    lng: lead.lng ?? 0,
                    rating: lead.rating ?? undefined,
                    website: lead.website ?? undefined,
                }))
                : businesses,
        [tab, savedLeads, businesses],
    );

    // Add types to displayBusinesses for saved leads (ensure all have types)
    const displayBusinessesWithTypes = useMemo<DisplayBusiness[]>(
        () =>
            (displayBusinesses as Business[]).map((b) => ({
                ...b,
                _types: b.types ?? [],
                _userRatingsTotal: b.userRatingsTotal ?? 0,
            })),
        [displayBusinesses],
    );

    // Apply filters
    const filteredBusinesses = useMemo(
        () =>
            displayBusinessesWithTypes.filter((b) => {
                if (filterMinRating > 0 && (b.rating ?? 0) < filterMinRating) {
                    return false;
                }
                if (filterHasWebsite === true && !b.website) return false;
                if (filterHasWebsite === false && b.website) return false;
                return true;
            }),
        [displayBusinessesWithTypes, filterMinRating, filterHasWebsite],
    );

    const mappableBusinesses = useMemo(
        () => filteredBusinesses.filter((business) => business.lat && business.lng),
        [filteredBusinesses],
    );

    const businessIndexById = useMemo(
        () => new globalThis.Map(businesses.map((business, index) => [business.id, index])),
        [businesses],
    );

    const leadsByPlaceId = useMemo(
        () => new globalThis.Map((savedLeads ?? []).map((lead) => [lead.placeId, lead])),
        [savedLeads],
    );

    const handleMarkerClick = useCallback(
        (businessId: string) => {
            if (tab === "search") {
                const idx = businessIndexById.get(businessId);
                if (idx === undefined) return;

                const business = businesses[idx];
                if (!business) return;

                // Keep marker click lightweight so popup can appear on first click.
                // Updating URL state (`idx`) here can trigger a rerender and interrupt popup opening.
                if (selectedLeadId) {
                    setSelectedLeadId(null);
                }

                if (business.lat !== 0 && business.lng !== 0) {
                    panMapTo(business.lat, business.lng);
                }
                return;
            }

            const lead = leadsByPlaceId.get(businessId);
            if (lead) handleLeadSelect(lead);
        },
        [
            tab,
            businessIndexById,
            businesses,
            leadsByPlaceId,
            selectedLeadId,
            setSelectedLeadId,
            panMapTo,
            handleLeadSelect,
        ],
    );

    return (
        <div className="relative flex h-[calc(100svh-var(--header-height))] overflow-hidden">
            {/* Left Panel */}
            <div className="flex h-full w-[325px] min-w-[300px] flex-col border-r bg-white">
                <Tabs
                    value={tab}
                    onValueChange={(value) => {
                        setTab(value);
                        if (value === "leads") setSelectedIdx(null);
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
                                void utils.leads.getAll.prefetch();
                            }}
                        >
                            <List />
                            Saved Leads {savedLeads?.length ? `(${savedLeads.length})` : ""}
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
                                    filtersOpen={filtersOpen}
                                    onOpenChange={setFiltersOpen}
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

                            <div className="flex flex-col gap-2" ref={listRef}>
                                {(isLoading || locationLoading) && (
                                    Array.from({ length: 5 }).map((_, index) => (
                                        <ListItemLoading key={index} />
                                    ))
                                )}

                                {filteredBusinesses.map((business, i) => (
                                    <ListItem
                                        key={business.id}
                                        onClick={() => handleBusinessSelectFromMap(i)}
                                        data={business}
                                        selectedIdx={selectedIdx}
                                        index={i}
                                    />
                                ))}

                                {!isLoading && !locationLoading && businesses.length === 0 && (
                                    <div className="py-4 text-xs text-center text-muted-foreground">
                                        {searchQuery ? "No results found" : "Loading nearby places..."}
                                    </div>
                                )}
                            </div>
                        </div>
                    </TabsContent>

                    <TabsContent value="leads" className="min-h-0 flex-1 overflow-y-auto p-4">
                        <div className="mb-3 flex justify-end">
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
                            {savedLeads && savedLeads.length > 0 ? (
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
                isLoadingNearby={isLoadingNearby}
                onToggleRadius={handleToggleRadius}
                onSearchThisArea={handleSearchThisArea}
                onLocateFound={handleLocateFound}
                onMarkerClick={handleMarkerClick}
                onSaveBusiness={handleSaveBusiness}
                onRadiusCenterChange={setRadiusCenter}
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
                                <Button variant="outline">
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
