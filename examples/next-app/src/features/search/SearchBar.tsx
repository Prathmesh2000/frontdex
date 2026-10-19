'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { trackEvent } from '@/lib/api';
import { useDebounce } from './useDebounce';
import { useSearchStore } from './useSearchStore';

interface SearchBarProps {
  placeholder?: string;
  /** Navigate to /search on submit (header) or only report the term (search page) */
  onSearch?: (term: string) => void;
  autoFocus?: boolean;
}

/** Debounced search input with recent-term suggestions. */
export function SearchBar({ placeholder = 'Search', onSearch, autoFocus = false }: SearchBarProps) {
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState(false);
  const debounced = useDebounce(term, 250);
  const recent = useSearchStore((s) => s.recent);
  const addRecent = useSearchStore((s) => s.addRecent);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    if (debounced.length >= 2) onSearch?.(debounced);
  }, [debounced, onSearch]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!term.trim()) return;
    addRecent(term.trim());
    trackEvent('search', { term });
    if (onSearch) onSearch(term);
    else router.push(`/search?q=${encodeURIComponent(term)}`);
  };

  return (
    <form role="search" onSubmit={handleSubmit} className="search-bar relative">
      <input ref={inputRef} type="search" required minLength={2} placeholder={placeholder} value={term} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} onChange={(e) => setTerm(e.target.value)} />
      {open && recent.length > 0 && (
        <ul className="suggestions absolute">{recent.map((r) => <li key={r} onMouseDown={() => setTerm(r)}>{r}</li>)}</ul>
      )}
    </form>
  );
}
