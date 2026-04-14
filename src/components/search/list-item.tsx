import {
    Item,
    ItemContent,
    ItemDescription,
    ItemFooter,
    ItemHeader,
    ItemTitle,
} from "~/components/ui/item"
import { Star } from "lucide-react"

interface ListItemData {
    id: string
    name: string
    address: string
    area?: string | null
    _types?: string[]
    _userRatingsTotal?: number
    rating?: number
    _distanceKm?: number
    _contactabilityScore?: number
}

interface ListItemProps {
    onClick: () => void
    data: ListItemData
    selected: boolean
}

const ListItem = ({ onClick, data, selected }: ListItemProps) => {
    return (
        <div data-business-id={data.id}>
            <Item
                render={<button type="button" />}
                onClick={onClick}
                variant={selected ? "muted" : "outline"}
                className="w-full cursor-pointer text-left hover:bg-muted/50"
            >
                <ItemContent>
                    <ItemHeader>
                        {(data._distanceKm !== undefined || data._contactabilityScore !== undefined) && (
                            <div className="text-[11px] text-muted-foreground flex items-center justify-between gap-2">
                                <div className="flex items-center justify-between gap-2">
                                    <span>
                                        {data._distanceKm !== undefined
                                            ? `${data._distanceKm.toFixed(1)} km away`
                                            : "Distance unavailable"}
                                    </span>
                                </div>
                            </div>
                        )}
                    </ItemHeader>
                    <ItemTitle className="font-medium">{data.name}</ItemTitle>
                    <ItemDescription className="line-clamp-1">{data.address}</ItemDescription>
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground/70">
                        {data._types?.[0] && (
                            <span className="capitalize">{data._types[0].replace(/_/g, " ")}</span>
                        )}
                        {data.area && (
                            <>
                                <span>•</span>
                                <span>{data.area}</span>
                            </>
                        )}
                    </div>
                </ItemContent>
                <ItemFooter className="border-t pt-2 text-xs text-muted-foreground">
                    {(data._userRatingsTotal ?? 0) > 0 ? (
                        <span>{data._userRatingsTotal} reviews</span>
                    ) : (
                        <span>No reviews yet</span>
                    )}
                    {data.rating ? (
                        <div className="flex items-center gap-1 text-xs">
                            <Star className="size-3 fill-yellow-500 text-yellow-500" />
                            <span>{data.rating}</span>
                        </div>
                    ) : null}
                </ItemFooter>

            </Item>
        </div>
    )
}

export default ListItem