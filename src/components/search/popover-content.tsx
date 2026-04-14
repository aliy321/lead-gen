import { ChevronRightIcon } from "lucide-react";
import type { Business } from "~/app/(admin)/dashboard/lead/types";

import { Button } from "~/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "~/components/ui/card";

interface MapPopoverContentProps<TBusiness extends Business> {
    business: TBusiness;
    cacheEntry?: {
        status: "idle" | "loading" | "done" | "error";
        website?: string | null;
        phone?: string | null;
        hasWebsite?: boolean | null;
    };
    isSearchTab: boolean;
    isSaved: boolean;
    onSaveBusiness: (business: TBusiness) => void;
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

export function MapPopoverContent<TBusiness extends Business>({
    business,
    cacheEntry,
    isSearchTab,
    isSaved,
    onSaveBusiness,
}: MapPopoverContentProps<TBusiness>) {
    const isLoadingDetails = cacheEntry?.status === "loading";
    const hasDetailsError = cacheEntry?.status === "error";
    const websiteUrl = getSafeExternalUrl(cacheEntry?.website ?? business.website);
    const hasWebsite =
        cacheEntry?.status === "done"
            ? (cacheEntry.hasWebsite ?? Boolean(cacheEntry.website))
            : Boolean(business.website);
    const shouldShowUnknownWebsite =
        isSearchTab &&
        !hasWebsite &&
        cacheEntry?.status !== "done" &&
        !isLoadingDetails;
    const websiteText = hasWebsite
        ? (websiteUrl ? "Open link" : "Yes")
        : isLoadingDetails
            ? "Checking..."
            : shouldShowUnknownWebsite
                ? "Unknown"
                : "No";
    const phoneText =
        cacheEntry?.phone ??
        business.phone ??
        (isLoadingDetails ? "Checking..." : "Unknown");
    const hasWebsiteLink = Boolean(hasWebsite && websiteUrl);

    return (
        <Card size="sm" className="mx-auto w-full max-w-xs">
            <CardHeader>
                <CardTitle className="text-sm">{business.name}</CardTitle>
                <CardDescription className="text-xs">{business.address}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
                <ul className="grid gap-2 text-sm">
                    <li className="flex gap-1">
                        <ChevronRightIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                        <span>Phone: {phoneText}</span>
                    </li>
                    <li className="flex gap-1">
                        <ChevronRightIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                        <span>
                            Website:{" "}
                            {hasWebsiteLink ? (
                                <a
                                    href={websiteUrl ?? undefined}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-primary underline underline-offset-2"
                                >
                                    {websiteText}
                                </a>
                            ) : (
                                websiteText
                            )}
                        </span>
                    </li>
                </ul>
                {hasDetailsError ? (
                    <p className="text-xs text-amber-600">
                        We couldn&apos;t load some place details.
                    </p>
                ) : null}
            </CardContent>
            <CardFooter>
                <Button
                    size="sm"
                    className="w-full"
                    variant={isSaved ? "outline" : "default"}
                    onClick={() => onSaveBusiness(business)}
                    disabled={isSaved}
                >
                    {isSaved ? "Saved" : "Save lead"}
                </Button>
            </CardFooter>
        </Card>
    );
}
