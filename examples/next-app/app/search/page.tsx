'use client';
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { SearchBar } from '@/features/search/SearchBar';
import { SearchResults } from '@/features/search/SearchResults';

/** Live search: SearchBar reports debounced terms, SearchResults fetches them. */
export default function SearchPage() {
  const initial = useSearchParams().get('q') ?? '';
  const [term, setTerm] = useState(initial);
  return (
    <>
      <SearchBar placeholder="What are you looking for?" onSearch={setTerm} autoFocus />
      <SearchResults term={term} />
    </>
  );
}
