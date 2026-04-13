import { Search, XIcon } from "lucide-react"
import {
    InputGroup,
    InputGroupAddon,
    InputGroupInput,
} from "~/components/ui/input-group"
import { Spinner } from "~/components/ui/spinner"
import { Button } from "../ui/button"

interface SearchInputProps {
    value: string
    onChange: (value: string) => void
    isLoading?: boolean
    resultCount?: number
    onClearSearchAndFilters: () => void
}
const SearchInput = ({
    value,
    onChange,
    isLoading = false,
    resultCount = 0,
    onClearSearchAndFilters,
}: SearchInputProps) => {
    return (
        <div className="space-y-1">
            <InputGroup className="w-full">
                <InputGroupInput placeholder="Search..." value={value} onChange={(e) => onChange(e.target.value)} />
                <InputGroupAddon>
                    {isLoading ? <Spinner /> : <Search />}
                </InputGroupAddon>
                <InputGroupAddon align="inline-end" className="text-xs" >
                    <Button type="button" variant="ghost" size="icon" onClick={onClearSearchAndFilters}>
                        <XIcon />
                        <span className="sr-only">Clear search and filters</span>
                    </Button>
                </InputGroupAddon>
            </InputGroup>

            <span className="text-xs text-muted-foreground">{resultCount} {resultCount === 1 ? "result" : "results"}</span>
        </div>

    )
}

export default SearchInput