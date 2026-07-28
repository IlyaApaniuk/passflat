import { createClient } from '@supabase/supabase-js';
import { PRIVATE_CHANNEL } from './realtime';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/**
 * Server-side fan-out for chat. Every channel is private (see ./realtime): the
 * service-role key bypasses RLS on the send side, while subscribers are held to
 * the `realtime.messages` policies.
 *
 * The payload stays a "something changed" ping — no message body, no sender
 * name. Subscribers re-fetch through the authenticated `/api/conversations`
 * routes, which check membership in application code. That keeps a mistake in a
 * channel policy from turning into a content leak, and means a participant who
 * forged a broadcast still cannot put words in anyone's mouth.
 *
 * `senderId` stays because the client needs it to ignore its own echo.
 */
interface BroadcastMessage {
  id: string;
  senderId: string;
  createdAt: string;
  conversationId: string;
}

/**
 * Publishes without joining the channel. `send()` on an unsubscribed channel
 * does the same thing by silently falling back to REST, but that fallback is
 * deprecated, so ask for HTTP delivery explicitly.
 */
async function publish(topic: string, event: string, payload: object) {
  const channel = supabase.channel(topic, PRIVATE_CHANNEL);
  const result = await channel.httpSend(event, payload);
  await supabase.removeChannel(channel);
  if (!result.success) {
    console.error(`[broadcast] ${event} on ${topic} failed: ${result.status} ${result.error}`);
  }
}

export async function broadcastNewMessage(conversationId: string, message: BroadcastMessage) {
  await publish(`chat:${conversationId}`, 'new_message', message);
}

export async function broadcastUnread(recipientUserId: string, message: BroadcastMessage) {
  await publish(`chat:notifications:${recipientUserId}`, 'new_message', message);
}

export async function broadcastNewConversation(recipientUserId: string) {
  await publish(`chat:notifications:${recipientUserId}`, 'new_conversation', {});
}

export async function broadcastRead(userId: string) {
  await publish(`chat:notifications:${userId}`, 'messages_read', {});
}
