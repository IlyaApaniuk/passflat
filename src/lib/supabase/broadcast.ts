import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/**
 * Realtime channels here are public: anyone holding the (public) anon key can
 * subscribe to `chat:<conversationId>` or `chat:notifications:<userId>` without
 * being a participant. So a broadcast is only ever a "something changed" ping —
 * never message content or sender names. Subscribers re-fetch the actual data
 * through the authenticated `/api/conversations` routes, which check membership.
 *
 * `senderId` stays because the client needs it to ignore its own echo, and user
 * ids are already public via listings.
 */
interface BroadcastMessage {
  id: string;
  senderId: string;
  createdAt: string;
  conversationId: string;
}

export async function broadcastNewMessage(conversationId: string, message: BroadcastMessage) {
  const channel = supabase.channel(`chat:${conversationId}`);
  await channel.send({
    type: 'broadcast',
    event: 'new_message',
    payload: message,
  });
  await supabase.removeChannel(channel);
}

export async function broadcastUnread(recipientUserId: string, message: BroadcastMessage) {
  const channel = supabase.channel(`chat:notifications:${recipientUserId}`);
  await channel.send({
    type: 'broadcast',
    event: 'new_message',
    payload: message,
  });
  await supabase.removeChannel(channel);
}

export async function broadcastNewConversation(recipientUserId: string) {
  const channel = supabase.channel(`chat:notifications:${recipientUserId}`);
  await channel.send({
    type: 'broadcast',
    event: 'new_conversation',
    payload: {},
  });
  await supabase.removeChannel(channel);
}

export async function broadcastRead(userId: string) {
  const channel = supabase.channel(`chat:notifications:${userId}`);
  await channel.send({
    type: 'broadcast',
    event: 'messages_read',
    payload: {},
  });
  await supabase.removeChannel(channel);
}
