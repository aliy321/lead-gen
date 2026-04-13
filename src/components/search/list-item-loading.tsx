import {
    Item,
    ItemContent,
    ItemDescription,
    ItemFooter,
    ItemTitle,
} from "~/components/ui/item"
import { Star } from "lucide-react"
import { Skeleton } from "../ui/skeleton"

const ListItemLoading = () => {
    return (
        <Item variant="outline">
            <ItemContent>
                <div className="">
                    <Skeleton className="h-6 w-full" />
                </div>
                <div className="">
                    <Skeleton className="h-4 w-2/3" />
                </div>
            </ItemContent>
            <ItemFooter className="border-t pt-2 text-xs text-muted-foreground">
                <Skeleton className="h-4 w-2/3" />
            </ItemFooter>
        </Item>
    )
}

export default ListItemLoading