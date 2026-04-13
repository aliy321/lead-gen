import {
    Item,
    ItemContent,
    ItemDescription,
    ItemFooter,
    ItemTitle,
} from "~/components/ui/item"
import { Star } from "lucide-react"

interface ListItemData {
    name: string
    address: string
    area?: string | null
    _types?: string[]
    _userRatingsTotal?: number
    rating?: number
}

interface ListItemProps {
    onClick: () => void
    data: ListItemData
    selectedIdx: number | null
    index: number
}

const ListItem = ({ onClick, data, selectedIdx, index }: ListItemProps) => {
    return (
        <Item
            render={<button type="button" />}
            onClick={onClick}
            variant={selectedIdx === index ? "muted" : "outline"}
            className="w-full cursor-pointer text-left hover:bg-accent/60"
        >
            <ItemContent>
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
                    <span className="text-accent-foreground">{data._userRatingsTotal} reviews</span>
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
    )
}

export default ListItem