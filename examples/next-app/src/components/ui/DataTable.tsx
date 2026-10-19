'use client';
import { useMemo, useState } from 'react';
import { Spinner } from './Spinner';

export interface Column<T> {
  key: keyof T & string;
  header: string;
  render?: (row: T) => React.ReactNode;
  sortable?: boolean;
}

interface DataTableProps<T> {
  rows: T[];
  columns: Column<T>[];
  /** Called with the clicked row */
  onRowClick?: (row: T) => void;
  loading?: boolean;
  emptyText?: string;
  pageSize?: number;
}

/** Generic sortable, paginated table used by every admin list. */
export function DataTable<T extends { id: string }>({ rows, columns, onRowClick, loading = false, emptyText = 'Nothing here yet', pageSize = 20 }: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [direction, setDirection] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => {
    if (!sortKey) return rows;
    const dir = direction === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => (String(a[sortKey as keyof T]) > String(b[sortKey as keyof T]) ? dir : -dir));
  }, [rows, sortKey, direction]);
  const visible = sorted.slice(page * pageSize, (page + 1) * pageSize);

  if (loading) return <Spinner label="Loading rows" />;
  if (!rows.length) return <p className="empty">{emptyText}</p>;
  return (
    <table>
      <thead>
        <tr>{columns.map((c) => <th key={c.key} onClick={() => c.sortable && (setSortKey(c.key), setDirection(direction === 'asc' ? 'desc' : 'asc'))}>{c.header}</th>)}</tr>
      </thead>
      <tbody>
        {visible.map((row) => <tr key={row.id} onClick={() => onRowClick?.(row)}>{columns.map((c) => <td key={c.key}>{c.render ? c.render(row) : String(row[c.key])}</td>)}</tr>)}
      </tbody>
      <tfoot><tr><td><button onClick={() => setPage(Math.max(0, page - 1))}>Prev</button><button onClick={() => setPage(page + 1)}>Next</button></td></tr></tfoot>
    </table>
  );
}
