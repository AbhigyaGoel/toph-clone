import { ScreenSkeleton } from '@/components/shell/ScreenSkeleton';

/**
 * What the column beside the rail shows while the next screen is being built.
 *
 * Its existence is the fix for the navigation lag, not its texture. Without a
 * Suspense boundary here, React has nothing to swap in when a route starts
 * loading, so the browser holds the *previous* screen on screen — fully
 * interactive, entirely wrong — until the server has finished. Every click cost
 * about a second of that.
 *
 * The rail is not in here because the rail is in the layout, outside this
 * boundary. It never blanks, and its highlight has already moved to where you
 * are going.
 */
export default function Loading() {
  return <ScreenSkeleton />;
}
