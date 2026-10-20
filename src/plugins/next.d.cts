type NextConfig = Record<string, unknown> | ((phase: string, ctx: unknown) => unknown);

/** Wraps a Next.js config so `next dev` also runs `frontdex watch`. */
export declare function withFrontdex(nextConfig?: NextConfig, options?: { enabled?: boolean }): (phase: string, ctx: unknown) => Promise<unknown>;
/** @deprecated react-catalogue era name of withFrontdex. */
export declare const withCatalogue: typeof withFrontdex;
