import { channels, type Conversation, type ConversationChannel } from '../types';

export function conversationChannels(conversation: Pick<Conversation, 'channel' | 'replyChannels'>): ConversationChannel[] {
  const selected = conversation.replyChannels;
  return selected?.length && selected.every(channel => Object.hasOwn(channels, channel))
    ? [...new Set(selected)] : [conversation.channel];
}
