'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
} from '@tanstack/react-table';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { MilestoneTracker } from './MilestoneTracker';
import { DSCRGauge } from './DSCRGauge';
import { ArrowUpDown, MoreHorizontal, Eye, FileText, Clock } from 'lucide-react';
import type { Application } from '@/types';
import { format } from 'date-fns';

interface ApplicationTableProps {
  applications: Application[];
}

export function ApplicationTable({ applications }: ApplicationTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState('');

  const formatCurrency = (cents?: number) => {
    if (!cents) return '-';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(cents / 100);
  };

  const columns: ColumnDef<Application>[] = [
    {
      accessorKey: 'loanNumber',
      header: 'Loan #',
      cell: ({ row }) => (
        <Link
          href={`/applications/${row.original.id}`}
          className="font-medium hover:underline"
        >
          {row.original.loanNumber || row.original.id.slice(0, 8)}
        </Link>
      ),
    },
    {
      accessorKey: 'property',
      header: 'Property',
      cell: ({ row }) => (
        <div>
          <div className="font-medium">{row.original.property.city}, {row.original.property.state}</div>
          <div className="text-sm text-muted-foreground">{row.original.property.propertyType}</div>
        </div>
      ),
      accessorFn: (row) => `${row.property.city} ${row.property.state}`,
    },
    {
      accessorKey: 'loanAmount',
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="-ml-4"
        >
          Loan Amount
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => formatCurrency(row.original.loanTerms.loanAmountCents),
      accessorFn: (row) => row.loanTerms.loanAmountCents,
    },
    {
      accessorKey: 'milestone',
      header: 'Milestone',
      cell: ({ row }) => (
        <div className="flex flex-col gap-1">
          <StatusBadge status={row.original.milestone} />
          <MilestoneTracker currentMilestone={row.original.milestone} compact />
        </div>
      ),
      filterFn: (row, id, value) => {
        return value === 'all' || row.getValue(id) === value;
      },
    },
    {
      accessorKey: 'dscr',
      header: 'DSCR',
      cell: ({ row }) =>
        row.original.dscrCalculation ? (
          <DSCRGauge dscr={row.original.dscrCalculation.dscr} size="sm" />
        ) : (
          <span className="text-muted-foreground">-</span>
        ),
      accessorFn: (row) => row.dscrCalculation?.dscr || 0,
    },
    {
      accessorKey: 'ltv',
      header: 'LTV',
      cell: ({ row }) =>
        row.original.ltv ? (
          <span className="font-medium">{(row.original.ltv * 100).toFixed(1)}%</span>
        ) : (
          <span className="text-muted-foreground">-</span>
        ),
    },
    {
      accessorKey: 'conditions',
      header: 'Conditions',
      cell: ({ row }) => {
        const counts = row.original.conditionCounts;
        if (!counts) return <span className="text-muted-foreground">-</span>;

        return (
          <div className="flex items-center gap-1">
            <Badge variant="outline" className="bg-yellow-50">
              {counts.pending} pending
            </Badge>
            {counts.cleared > 0 && (
              <Badge variant="outline" className="bg-green-50 text-green-700">
                {counts.cleared} cleared
              </Badge>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: 'assignedLO',
      header: 'LO',
      cell: ({ row }) =>
        row.original.assignedLO
          ? `${row.original.assignedLO.firstName} ${row.original.assignedLO.lastName.charAt(0)}.`
          : '-',
    },
    {
      accessorKey: 'updatedAt',
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="-ml-4"
        >
          Updated
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => format(new Date(row.original.updatedAt), 'MMM d'),
    },
    {
      id: 'actions',
      cell: ({ row }) => {
        const app = row.original;

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <span className="sr-only">Open menu</span>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuItem asChild>
                <Link href={`/applications/${app.id}`}>
                  <Eye className="mr-2 h-4 w-4" />
                  View Details
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/applications/${app.id}/documents`}>
                  <FileText className="mr-2 h-4 w-4" />
                  Documents
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/applications/${app.id}/conditions`}>
                  <Clock className="mr-2 h-4 w-4" />
                  Conditions
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  const table = useReactTable({
    data: applications,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    state: {
      sorting,
      columnFilters,
      globalFilter,
    },
  });

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-4">
        <Input
          placeholder="Search loans..."
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          className="max-w-sm"
        />
        <Select
          value={(columnFilters.find((f) => f.id === 'milestone')?.value as string) || 'all'}
          onValueChange={(value) =>
            setColumnFilters((prev) => {
              const others = prev.filter((f) => f.id !== 'milestone');
              if (value === 'all') return others;
              return [...others, { id: 'milestone', value }];
            })
          }
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filter by milestone" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Milestones</SelectItem>
            <SelectItem value="APPLICATION">Application</SelectItem>
            <SelectItem value="PRE_APPROVED">Pre-Approved</SelectItem>
            <SelectItem value="PROCESSING">Processing</SelectItem>
            <SelectItem value="SUBMITTED">Submitted</SelectItem>
            <SelectItem value="CONDITIONALLY_APPROVED">Cond. Approved</SelectItem>
            <SelectItem value="APPROVED">Approved</SelectItem>
            <SelectItem value="DOCS_OUT">Docs Out</SelectItem>
            <SelectItem value="CLEAR_TO_CLOSE">CTC</SelectItem>
            <SelectItem value="CLOSING">Closing</SelectItem>
            <SelectItem value="FUNDED">Funded</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  No applications found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination info */}
      <div className="text-sm text-muted-foreground">
        Showing {table.getRowModel().rows.length} of {applications.length} applications
      </div>
    </div>
  );
}
