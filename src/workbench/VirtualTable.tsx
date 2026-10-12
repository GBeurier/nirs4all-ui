import { useMemo, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";

import { cx } from "./_cx.js";
import { useElementSize } from "./hooks.js";

export interface VirtualColumn<R> {
  key: string;
  header: ReactNode;
  /** CSS grid track (e.g. `"64px"`, `"minmax(120px, 1fr)"`). */
  width?: string;
  align?: "start" | "end" | "center";
  cell: (row: R, index: number) => ReactNode;
  /** Sort key; omit to make the column unsortable. */
  sortValue?: (row: R) => number | string | null;
  title?: string;
}

export interface VirtualTableProps<R> {
  rows: readonly R[];
  columns: readonly VirtualColumn<R>[];
  rowKey: (row: R) => string | number;
  rowHeight?: number | undefined;
  isSelected?: ((row: R) => boolean) | undefined;
  isActive?: ((row: R) => boolean) | undefined;
  rowStyle?: ((row: R) => CSSProperties) | undefined;
  onRowClick?: ((row: R, event: MouseEvent<HTMLDivElement>) => void) | undefined;
  onRowHover?: ((row: R | null) => void) | undefined;
  defaultSort?: { key: string; dir: "asc" | "desc" } | undefined;
  empty?: ReactNode | undefined;
  ariaLabel: string;
  className?: string | undefined;
}

/**
 * Windowed table (only the visible rows are mounted) with sortable headers,
 * sticky header, and row selection styling. Renders 100 000 rows smoothly.
 */
export function VirtualTable<R>({
  rows,
  columns,
  rowKey,
  rowHeight = 30,
  isSelected,
  isActive,
  rowStyle,
  onRowClick,
  onRowHover,
  defaultSort,
  empty,
  ariaLabel,
  className,
}: VirtualTableProps<R>) {
  const [scrollTop, setScrollTop] = useState(0);
  const [boxRef, size] = useElementSize<HTMLDivElement>({ width: 600, height: 360 });
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(defaultSort ?? null);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const column = columns.find((c) => c.key === sort.key);
    if (!column?.sortValue) return rows;
    const getter = column.sortValue;
    const decorated = rows.map((row, index) => ({ row, index, value: getter(row) }));
    decorated.sort((a, b) => {
      const av = a.value;
      const bv = b.value;
      if (av === null && bv === null) return a.index - b.index;
      if (av === null) return 1;
      if (bv === null) return -1;
      const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv), undefined, { numeric: true });
      return (sort.dir === "asc" ? cmp : -cmp) || a.index - b.index;
    });
    return decorated.map((d) => d.row);
  }, [rows, columns, sort]);

  const template = columns.map((c) => c.width ?? "minmax(80px, 1fr)").join(" ");
  const viewport = Math.max(rowHeight * 4, size.height - rowHeight);
  const first = Math.max(0, Math.floor(scrollTop / rowHeight) - 6);
  const last = Math.min(sorted.length, Math.ceil((scrollTop + viewport) / rowHeight) + 6);
  const visible = sorted.slice(first, last);

  return (
    <div className={cx("n4wb-table", className)} ref={boxRef} role="grid" aria-label={ariaLabel} aria-rowcount={sorted.length + 1}>
      <div className="n4wb-table-head" role="row" style={{ gridTemplateColumns: template, height: rowHeight }}>
        {columns.map((column) => {
          const active = sort?.key === column.key;
          return (
            <div
              key={column.key}
              role="columnheader"
              className={cx("n4wb-table-th", `is-${column.align ?? "start"}`)}
              aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : "none"}
              title={column.title}
            >
              {column.sortValue ? (
                <button
                  type="button"
                  onClick={() =>
                    setSort((current) =>
                      current?.key === column.key ? { key: column.key, dir: current.dir === "asc" ? "desc" : "asc" } : { key: column.key, dir: "asc" },
                    )
                  }
                >
                  {column.header}
                  <span className="n4wb-sort" aria-hidden="true">
                    {active ? (sort!.dir === "asc" ? "▲" : "▼") : "↕"}
                  </span>
                </button>
              ) : (
                column.header
              )}
            </div>
          );
        })}
      </div>
      <div className="n4wb-table-scroll" onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)} onMouseLeave={() => onRowHover?.(null)}>
        {sorted.length === 0 ? (
          <div className="n4wb-table-empty">{empty}</div>
        ) : (
          <div style={{ height: sorted.length * rowHeight, position: "relative" }}>
            {visible.map((row, i) => {
              const index = first + i;
              return (
                <div
                  key={rowKey(row)}
                  role="row"
                  aria-rowindex={index + 2}
                  aria-selected={isSelected?.(row) ?? false}
                  className={cx("n4wb-table-row", isSelected?.(row) && "is-selected", isActive?.(row) && "is-active", onRowClick && "is-clickable")}
                  style={{ ...rowStyle?.(row), gridTemplateColumns: template, height: rowHeight, transform: `translateY(${index * rowHeight}px)` }}
                  onClick={onRowClick ? (event) => onRowClick(row, event) : undefined}
                  onMouseEnter={onRowHover ? () => onRowHover(row) : undefined}
                >
                  {columns.map((column) => (
                    <div key={column.key} role="gridcell" className={cx("n4wb-table-td", `is-${column.align ?? "start"}`)}>
                      {column.cell(row, index)}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
