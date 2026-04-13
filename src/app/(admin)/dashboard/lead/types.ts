export interface Business {
    id: string;
    name: string;
    address: string;
    area: string | null;
    lat: number;
    lng: number;
    rating?: number;
    userRatingsTotal?: number;
    types?: string[];
    website?: string;
    phone?: string;
    hasWebsite?: boolean;
    websiteVerified?: boolean;
    websiteVerifiedAt?: Date;
    _types?: string[];
    _userRatingsTotal?: number;
}

export interface DisplayBusiness extends Business {
    _types: string[];
    _userRatingsTotal: number;
}

export interface SavedLead {
    id: string;
    placeId: string;
    name: string;
    address: string | null;
    area: string | null;
    lat: number | null;
    lng: number | null;
    rating: number | null;
    reviewCount: number | null;
    types: string | null;
    website: string | null;
    phone: string | null;
    status: string | null;
    score: number | null;
    notes: string | null;
    createdAt: Date | null;
}

export type LeadStatus =
    | "new"
    | "reviewing"
    | "qualified"
    | "contacted"
    | "replied"
    | "demo_ready"
    | "closed"
    | "skipped";

export const STATUS_LABELS: Record<LeadStatus, { label: string; color: string }> = {
    new: { label: "New", color: "bg-blue-100 text-blue-800" },
    reviewing: { label: "Reviewing", color: "bg-yellow-100 text-yellow-800" },
    qualified: { label: "Qualified", color: "bg-green-100 text-green-800" },
    contacted: { label: "Contacted", color: "bg-purple-100 text-purple-800" },
    replied: { label: "Replied", color: "bg-emerald-100 text-emerald-800" },
    demo_ready: { label: "Demo Ready", color: "bg-indigo-100 text-indigo-800" },
    closed: { label: "Closed", color: "bg-gray-100 text-gray-800" },
    skipped: { label: "Skipped", color: "bg-red-100 text-red-800" },
};

export const MARKER_SIGNAL = {
    noWebsite: "bg-red-500",
    hasWebsite: "bg-green-500",
    pending: "bg-yellow-500",
    selected: "bg-blue-500",
} as const;
