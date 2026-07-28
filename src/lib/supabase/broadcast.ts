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

export async function broadcastNewMessage(conversationId: string, message: BroadcastMessage) {
  const channel = supabase.channel(`chat:${conversationId}`, PRIVATE_CHANNEL);
  await channel.send({
    type: 'broadcast',
    event: 'new_message',
    payload: message,
  });
  await supabase.removeChannel(channel);
}

export async function broadcastUnread(recipientUserId: string, message: BroadcastMessage) {
  const channel = supabase.channel(`chat:notifications:${recipientUserId}`, PRIVATE_CHANNEL);
  await channel.send({
    type: 'broadcast',
    event: 'new_message',
    payload: message,
  });
  await supabase.removeChannel(channel);
}

export async function broadcastNewConversation(recipientUserId: string) {
  const channel = supabase.channel(`chat:notifications:${recipientUserId}`, PRIVATE_CHANNEL);
  await channel.send({
    type: 'broadcast',
    event: 'new_conversation',
    payload: {},
  });
  await supabase.removeChannel(channel);
}

export async function broadcastRead(userId: string) {
  const channel = supabase.channel(`chat:notifications:${userId}`, PRIVATE_CHANNEL);
  await channel.send({
    type: 'broadcast',
    event: 'messages_read',
    payload: {},
  });
  await supabase.removeChannel(channel);
}
