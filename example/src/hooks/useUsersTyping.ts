import { Conversation } from 'xmtp-react-native-sdk';
import { useReceivedEphemeralMessages } from '../hooks';
import { useEffect, useState } from 'react';
import { TypingStatus } from './useIsTyping';

export const useAddressesTyping = (conversation: Conversation | undefined): string[] => {
  const [typingUsers, setTypingUsers] = useState<string[]>([]);

  const latestEphemeralMessage = useReceivedEphemeralMessages(conversation)

  useEffect(() => {
    if (!latestEphemeralMessage) {
      return
    }

    if (latestEphemeralMessage.content.text === TypingStatus.typing && !typingUsers.includes(latestEphemeralMessage.senderAddress)) {
      setTypingUsers(previousUsers => [...previousUsers, latestEphemeralMessage.senderAddress]);
    } else if (latestEphemeralMessage.content.text === TypingStatus.notTyping) {
      setTypingUsers(previousUsers => previousUsers.filter(address => address !== latestEphemeralMessage.senderAddress));
    }
  }, [latestEphemeralMessage]);

  return typingUsers;
}