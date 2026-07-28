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
 * Requires "Allow public access" to be off in the project's Realtime settings —
 * otherwise the same topic is still joinable as a public channel.
 */
export const PRIVATE_CHANNEL = { config: { private: true } } as const;
