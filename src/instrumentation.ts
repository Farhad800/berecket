/**
 * Server error logging. Every unhandled error in a page, route or server action is written
 * as one JSON line, which appears in Vercel → Project → Logs (filter by "level":"error").
 * No request bodies, cookies or passwords are logged.
 */
export function register() {}

export async function onRequestError(
  error: unknown,
  request: { path: string; method: string },
  context: { routerKind: string; routePath: string; routeType: string },
) {
  const e = error as Error & { digest?: string };
  console.error(
    JSON.stringify({
      level: "error",
      at: new Date().toISOString(),
      digest: e.digest, // matches the "ref:" shown to the user on the error page
      message: e.message?.slice(0, 500),
      method: request.method,
      path: request.path.split("?")[0],
      route: context.routePath,
      type: context.routeType,
      stack: e.stack?.split("\n").slice(0, 6).join(" | "),
    }),
  );
}
