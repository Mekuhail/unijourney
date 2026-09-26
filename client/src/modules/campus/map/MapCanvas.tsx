import { lazy, Suspense } from 'react';
import type { Campus, MapLocation, RouteResult } from '../types';
import { Skeleton } from '@/components/ui';
import type { Basemap, Category } from './style';

/**
 * Provider abstraction: the page renders <MapCanvas provider="osm" | "google" …/> and both implementations draw the same
 * boundary, footprints, category pins, labels and route. Google is only used when the server exposes a key.
 */
export interface MapCanvasProps {
  campus: Campus | null;
  locations: MapLocation[];
  route: RouteResult | null;
  selected: string | null;
  onSelect: (id: string) => void;
  provider: 'osm' | 'google';
  googleKey?: string | null;
  basemap: Basemap;
  /** Categories switched off by the filter chips (selected place and route endpoints stay visible). */
  hidden: ReadonlySet<Category>;
  dark: boolean;
  reducedMotion: boolean;
  locale: 'en' | 'ar';
  className?: string;
  /** Endpoints to emphasise even when they are rooms (rooms sit inside their building). */
  endpoints?: { from?: string | null; to?: string | null };
  /** Increment to re-fit the view to the campus boundary. */
  recenterKey?: number;
}

export const ROUTE_COLOR = '#f0762b';
export const BOUNDARY_COLOR = '#c8975b';

const LeafletCanvas = lazy(() => import('./LeafletCanvas'));
const GoogleCanvas = lazy(() => import('./GoogleCanvas'));

export function MapCanvas(props: MapCanvasProps) {
  const useGoogle = props.provider === 'google' && !!props.googleKey;
  return (
    <Suspense fallback={<Skeleton className={props.className ?? 'h-[420px] w-full'} />}>
      {useGoogle ? <GoogleCanvas {...props} /> : <LeafletCanvas {...props} />}
    </Suspense>
  );
}
