"use client"

import { useState } from "react"
import { FunnelPlusIcon, XIcon } from "lucide-react"

import { Button } from "~/components/ui/button"
import { Popover, PopoverContent, PopoverDescription, PopoverTitle, PopoverHeader, PopoverTrigger } from "~/components/ui/popover"
import { Separator } from "../ui/separator"

interface SearchFilterProps {
    filterMinRating: number
    onMinRatingChange: (value: number) => void
    filterHasWebsite: boolean | null
    onHasWebsiteChange: (value: boolean | null) => void
    radius: number
    onRadiusChange: (value: number) => void
    resultLimit: number
    onResultLimitChange: (value: number) => void
}

const RATING_OPTIONS = [0, 3, 3.5, 4, 4.5] as const
const RADIUS_OPTIONS = [
    { value: 1000, label: "1km" },
    { value: 2000, label: "2km" },
    { value: 3000, label: "3km" },
    { value: 5000, label: "5km" },
] as const
const RESULT_LIMIT_OPTIONS = [10, 20, 30, 40, 50] as const

export default function SearchFilter({
    filterMinRating,
    onMinRatingChange,
    filterHasWebsite,
    onHasWebsiteChange,
    radius,
    onRadiusChange,
    resultLimit,
    onResultLimitChange,
}: SearchFilterProps) {
    const [filtersOpen, setFiltersOpen] = useState(false)
    const hasActiveFilters =
        filterMinRating > 0 ||
        filterHasWebsite !== null ||
        radius !== 1000 ||
        resultLimit !== 10

    return (
        <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
            <PopoverTrigger
                render={
                    <Button type="button" variant="ghost" size="icon">
                        <FunnelPlusIcon />
                        {hasActiveFilters && (
                            <span className="absolute top-2 right-2 size-2 rounded-full bg-primary" />
                        )}
                        <span className="sr-only">Filter</span>
                    </Button>
                }
            />

            <PopoverContent className="w-fit gap-1.5" align="start">
                <PopoverHeader>
                    <PopoverTitle>
                        Filters
                    </PopoverTitle>
                    {/* <PopoverDescription>Apply filters to your search.</PopoverDescription> */}
                </PopoverHeader>

                <Separator />

                <div>
                    <div className="flex flex-col gap-3">
                        <div className="flex flex-col gap-1.5">
                            <p className="text-sm font-medium">Min Rating</p>
                            <div className="flex flex-wrap gap-1">
                                {RATING_OPTIONS.map((rating) => (
                                    <Button
                                        key={rating}
                                        type="button"
                                        size="xs"
                                        variant={filterMinRating === rating ? "default" : "outline"}
                                        onClick={() => onMinRatingChange(rating)}
                                    >
                                        {rating === 0 ? "Any" : `${rating}+`}
                                    </Button>
                                ))}
                            </div>
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <p className="text-sm font-medium">Website</p>
                            <div className="flex flex-wrap gap-1">
                                <Button
                                    type="button"
                                    size="xs"
                                    variant={filterHasWebsite === null ? "default" : "outline"}
                                    onClick={() => onHasWebsiteChange(null)}
                                >
                                    Any
                                </Button>
                                <Button
                                    type="button"
                                    size="xs"
                                    variant={filterHasWebsite === true ? "default" : "outline"}
                                    onClick={() => onHasWebsiteChange(true)}
                                >
                                    Has Website
                                </Button>
                                <Button
                                    type="button"
                                    size="xs"
                                    variant={filterHasWebsite === false ? "default" : "outline"}
                                    onClick={() => onHasWebsiteChange(false)}
                                >
                                    No Website
                                </Button>
                            </div>
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <p className="text-sm font-medium">Results per Search</p>
                            <div className="flex flex-wrap gap-1">
                                {RESULT_LIMIT_OPTIONS.map((limit) => (
                                    <Button
                                        type="button"
                                        key={limit}
                                        size="xs"
                                        variant={resultLimit === limit ? "default" : "outline"}
                                        onClick={() => onResultLimitChange(limit)}
                                    >
                                        {limit}
                                    </Button>
                                ))}
                            </div>
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <p className="text-sm font-medium">Radius</p>
                            <div className="flex flex-wrap gap-1">
                                {RADIUS_OPTIONS.map((radiusOption) => (
                                    <Button
                                        type="button"
                                        key={radiusOption.value}
                                        size="xs"
                                        variant={radius === radiusOption.value ? "default" : "outline"}
                                        onClick={() => onRadiusChange(radiusOption.value)}
                                    >
                                        {radiusOption.label}
                                    </Button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    )
}
