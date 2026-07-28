/**
 * Every Realtime channel in the app is private, so joining is authorized by RLS
 * policies on `realtime.messages` instead of being open to anyone holding the
 * (public) anon key.
 *
 * Both ends must agree: a private broadcast only reaches private subscribers and
 * a public one only reaches public subscribers, so the server publisher and the
 * browser subscriber have to pass this same config or messages are silently
 * dropped. Hence one shared constant rather than an option repeated per call.
 *
 * Joining is authorized by the policies in
 * supabase/snippets/realtime-authorization.sql, and closing the public route to
 * the same topics needs "Channel Restrictions" set to private-only under
 * Project Settings → Realtime Settings.
 */
export const PRIVATE_CHANNEL = { config: { private: true } } as const;
