'use client';
import { useEffect, useState } from 'react';
import Image from 'next/image';

/** Image carousel with arrow-key navigation. */
export function ProductGallery({ images, alt }: { images: string[]; alt: string }) {
  const [index, setIndex] = useState(0);
  const [zoomed, setZoomed] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setIndex((i) => (i + 1) % images.length);
      if (e.key === 'ArrowLeft') setIndex((i) => (i - 1 + images.length) % images.length);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [images.length]);

  return (
    <div className="gallery">
      <Image src={images[index]} alt={alt} width={720} height={720} className={zoomed ? 'zoomed' : undefined} onClick={() => setZoomed(!zoomed)} />
      <div className="thumbs flex gap-2">
        {images.map((src, i) => <button key={src} aria-current={i === index} onClick={() => setIndex(i)}><Image src={src} alt="" width={64} height={64} /></button>)}
      </div>
    </div>
  );
}
