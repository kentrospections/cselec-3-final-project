"use client"

import * as React from "react"
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table"
import {
  IconArrowUp,
  IconArrowDown,
  IconColumns3,
  IconChevronDown,
  IconFilter,
  IconRefresh,
  IconChevronsLeft,
  IconChevronLeft,
  IconChevronRight,
  IconChevronsRight,
} from "@tabler/icons-react"
import { cn } from "@/lib/utils"
import { useIsMobile } from "@/hooks/use-mobile"
import { Button } from "@/components/ui/button"
import {
  Drawer,
  DrawerContent,
} from "@/components/ui/drawer"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData, TValue> {
    compact?: boolean
  }
}

interface PrimaryFilterConfig {
  placeholder: string
  options: { label: string; value: string | undefined }[]
  value: string | undefined
  onChange: (v: string | undefined) => void
}

interface SecondaryFilterConfig {
  label: string
  options: string[]
  selected: Set<string>
  onToggle: (v: string) => void
}

interface DataTableProps<T> {
  columns: ColumnDef<T>[]
  data: T[]
  onReload: () => void
  isLoading?: boolean
  primaryFilter?: PrimaryFilterConfig
  secondaryFilter?: SecondaryFilterConfig
  renderDrawer?: (row: T) => React.ReactNode
  disablePagination?: boolean
  footerContent?: React.ReactNode
  isCompact?: boolean
  initialColumnVisibility?: VisibilityState
  isNewRow?: (row: T) => boolean
  newRowClass?: (row: T) => string
}

function SortIcon({ sorted }: { sorted: false | "asc" | "desc" }) {
  if (sorted === "asc") return <IconArrowUp className="ml-1 inline size-3.5" />
  if (sorted === "desc") return <IconArrowDown className="ml-1 inline size-3.5" />
  return null
}

export function DataTable<T>({
  columns,
  data,
  onReload,
  isLoading = false,
  primaryFilter,
  secondaryFilter,
  renderDrawer,
  disablePagination = false,
  footerContent,
  isCompact = false,
  initialColumnVisibility,
  isNewRow,
  newRowClass,
}: DataTableProps<T>) {
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>(
    initialColumnVisibility ?? {}
  )
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize: 10 })
  const [drawerRow, setDrawerRow] = React.useState<T | null>(null)
  const isMobile = useIsMobile()

  const table = useReactTable({
    data,
    columns,
    state: disablePagination
      ? { sorting, columnVisibility, columnFilters }
      : { sorting, columnVisibility, columnFilters, pagination },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnFiltersChange: setColumnFilters,
    ...(disablePagination ? {} : { onPaginationChange: setPagination }),
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    ...(disablePagination ? {} : { getPaginationRowModel: getPaginationRowModel() }),
    getSortedRowModel: getSortedRowModel(),
  })

  const isEmpty = data.length === 0
  const secondaryAnyChecked = (secondaryFilter?.selected.size ?? 0) > 0

  const primarySelectValue = primaryFilter?.value ?? "__all__"
  const primarySelectItems = primaryFilter?.options.map((o) => ({
    value: o.value ?? "__all__",
    label: o.label,
  }))

  const handlePrimaryChange = (v: string | null) => {
    primaryFilter?.onChange(!v || v === "__all__" ? undefined : v)
  }

  // Responsive class helpers — compact forces mobile-style layout regardless of viewport
  const px = isCompact ? "px-4" : "px-4 lg:px-6"
  const mx = isCompact ? "mx-4" : "mx-4 lg:mx-6"
  const btnLabel = isCompact ? "hidden" : "hidden lg:inline"

  return (
    <>
      <div className="flex w-full flex-col gap-4">
        {/* Toolbar */}
        <div className={cn("flex items-center justify-between", px)}>
          <div className="flex items-center gap-2">
            {primaryFilter && (
              <>
                <Label htmlFor="primary-filter" className="sr-only">
                  {primaryFilter.placeholder}
                </Label>
                <Select
                  value={primarySelectValue}
                  items={primarySelectItems}
                  onValueChange={handlePrimaryChange}
                  disabled={isEmpty}
                >
                  <SelectTrigger
                    size="sm"
                    id="primary-filter"
                    className={cn("flex w-36", !isCompact && "@4xl/main:hidden")}
                  >
                    <SelectValue placeholder={primaryFilter.placeholder} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {primaryFilter.options.map((opt) => (
                        <SelectItem
                          key={opt.value ?? "__all__"}
                          value={opt.value ?? "__all__"}
                        >
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>

                {!isCompact && (
                  <Tabs
                    value={primarySelectValue}
                    onValueChange={(v) => handlePrimaryChange(v as string)}
                    className="hidden @4xl/main:block"
                  >
                    <TabsList>
                      {primaryFilter.options.map((opt) => (
                        <TabsTrigger
                          key={opt.value ?? "__all__"}
                          value={opt.value ?? "__all__"}
                          disabled={isEmpty}
                        >
                          {opt.label}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </Tabs>
                )}
              </>
            )}

            {secondaryFilter && (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant={secondaryAnyChecked ? "default" : "outline"}
                      size="sm"
                      disabled={isEmpty}
                    />
                  }
                >
                  <IconFilter data-icon="inline-start" />
                  {secondaryFilter.label}
                  <IconChevronDown data-icon="inline-end" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-40">
                  {secondaryFilter.options.map((opt) => (
                    <DropdownMenuCheckboxItem
                      key={opt}
                      checked={secondaryFilter.selected.has(opt)}
                      onCheckedChange={() => secondaryFilter.onToggle(opt)}
                    >
                      {opt}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button variant="outline" size="sm" />}
              >
                <IconColumns3 />
                <span className={btnLabel}>Columns</span>
                <IconChevronDown data-icon="inline-end" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-36">
                {table
                  .getAllColumns()
                  .filter((col) => col.getCanHide())
                  .map((col) => (
                    <DropdownMenuCheckboxItem
                      key={col.id}
                      checked={col.getIsVisible()}
                      onCheckedChange={(v) => col.toggleVisibility(!!v)}
                    >
                      {typeof col.columnDef.header === "string"
                        ? col.columnDef.header
                        : col.id}
                    </DropdownMenuCheckboxItem>
                  ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="outline" size="sm" onClick={onReload} disabled={isLoading}>
              <IconRefresh className={cn(isLoading && "animate-spin")} />
              <span className={btnLabel}>Reload</span>
            </Button>
          </div>
        </div>

        {/* Table */}
        <div className={cn("rounded-lg border", mx, isCompact ? "overflow-x-auto" : "overflow-hidden")}>
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-muted">
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead
                      key={header.id}
                      colSpan={header.colSpan}
                      className={cn(header.column.columnDef.meta?.compact && "w-px whitespace-nowrap")}
                    >
                      {header.isPlaceholder ? null : header.column.getCanSort() ? (
                        <button
                          className="flex cursor-pointer select-none items-center font-medium"
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          <SortIcon sorted={header.column.getIsSorted()} />
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    className={cn(
                      renderDrawer && "cursor-pointer",
                      isNewRow?.(row.original) && (newRowClass?.(row.original) ?? "animate-new-row-enter")
                    )}
                    onClick={() => renderDrawer && setDrawerRow(row.original)}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        className={cn(cell.column.columnDef.meta?.compact && "w-px whitespace-nowrap")}
                      >
                        {isNewRow ? (
                          <div className={cn("grid", isNewRow(row.original) && "overflow-hidden animate-new-row-cell-expand")}>
                            <div className={cn("min-h-0", isNewRow(row.original) && "animate-new-row-cell-reveal")}>
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </div>
                          </div>
                        ) : (
                          flexRender(cell.column.columnDef.cell, cell.getContext())
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="h-24 text-center text-muted-foreground"
                  >
                    {isLoading ? "Loading..." : "No results."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Footer */}
        {disablePagination ? (
          footerContent && (
            <div className={cn("flex items-center", px)}>
              <div className="text-sm text-muted-foreground">{footerContent}</div>
            </div>
          )
        ) : (
          <div className={cn("flex items-center justify-between", px)}>
            <div className={cn("flex-1 text-sm text-muted-foreground", isCompact ? "hidden" : "hidden lg:flex")}>
              {table.getFilteredRowModel().rows.length} row(s) total
            </div>
            <div className={cn("flex items-center gap-8", isCompact ? "w-full" : "w-full lg:w-fit")}>
              <div className={cn("items-center gap-2", isCompact ? "hidden" : "hidden lg:flex")}>
                <Label htmlFor="rows-per-page" className="text-sm font-medium">
                  Rows per page
                </Label>
                <Select
                  value={`${table.getState().pagination.pageSize}`}
                  onValueChange={(v) => table.setPageSize(Number(v))}
                >
                  <SelectTrigger size="sm" className="w-20" id="rows-per-page">
                    <SelectValue placeholder={table.getState().pagination.pageSize} />
                  </SelectTrigger>
                  <SelectContent side="top">
                    <SelectGroup>
                      {[10, 20, 30, 50].map((size) => (
                        <SelectItem key={size} value={`${size}`}>
                          {size}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex w-fit items-center justify-center text-sm font-medium">
                Page {table.getState().pagination.pageIndex + 1} of{" "}
                {table.getPageCount()}
              </div>
              <div className={cn("flex items-center gap-2", isCompact ? "ml-auto" : "ml-auto lg:ml-0")}>
                <Button
                  variant="outline"
                  className={cn("size-8", isCompact ? "hidden" : "hidden lg:flex")}
                  size="icon"
                  onClick={() => table.setPageIndex(0)}
                  disabled={!table.getCanPreviousPage()}
                >
                  <span className="sr-only">First page</span>
                  <IconChevronsLeft />
                </Button>
                <Button
                  variant="outline"
                  className="size-8"
                  size="icon"
                  onClick={() => table.previousPage()}
                  disabled={!table.getCanPreviousPage()}
                >
                  <span className="sr-only">Previous page</span>
                  <IconChevronLeft />
                </Button>
                <Button
                  variant="outline"
                  className="size-8"
                  size="icon"
                  onClick={() => table.nextPage()}
                  disabled={!table.getCanNextPage()}
                >
                  <span className="sr-only">Next page</span>
                  <IconChevronRight />
                </Button>
                <Button
                  variant="outline"
                  className={cn("size-8", isCompact ? "hidden" : "hidden lg:flex")}
                  size="icon"
                  onClick={() => table.setPageIndex(table.getPageCount() - 1)}
                  disabled={!table.getCanNextPage()}
                >
                  <span className="sr-only">Last page</span>
                  <IconChevronsRight />
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {renderDrawer && (
        <Drawer
          open={!!drawerRow}
          onOpenChange={(open) => { if (!open) setDrawerRow(null) }}
          direction={isMobile ? "bottom" : "right"}
        >
          <DrawerContent className="overflow-hidden">
            <div className="flex-1 min-h-0 overflow-y-auto">
              {drawerRow && renderDrawer(drawerRow)}
            </div>
          </DrawerContent>
        </Drawer>
      )}
    </>
  )
}
