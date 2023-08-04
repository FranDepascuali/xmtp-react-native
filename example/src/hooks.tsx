import { useQuery, UseQueryResult } from "react-query";
import { Conversation, DecodedMessage } from "xmtp-react-native-sdk";
import { useXmtp } from "./XmtpContext";
import EncryptedStorage from "react-native-encrypted-storage";

/**
 * List all conversations.
 *
 * Note: this is better done with a DB, but we're using react-query for now.
 */
export function useConversationList(): UseQueryResult<Conversation[]> {
  const { client } = useXmtp();
  return useQuery<Conversation[]>(
    ["xmtp", "conversations", client?.address],
    () => client!.conversations.list(),
    {
      enabled: !!client,
    },
  );
}

/**
 * Get the conversation identified by `topic`.
 *
 * Note: this is better done with a DB, but we're using react-query for now.
 */
export function useConversation({
  topic,
}: {
  topic: string;
}): UseQueryResult<Conversation | undefined> {
  const { client } = useXmtp();
  // TODO: use a DB instead of scanning the cached conversation list
  return useQuery<Conversation[], unknown, Conversation | undefined>(
    ["xmtp", "conversations", client?.address, topic],
    () => client!.conversations.list(),
    {
      select: (conversations) => conversations.find((c) => c.topic === topic),
      enabled: !!client && !!topic,
    },
  );
}

/**
 * List messages in the conversation identified by `topic`.
 *
 * Note: this is better done with a DB, but we're using react-query for now.
 */
export function useMessages({
  topic,
}: {
  topic: string;
}): UseQueryResult<DecodedMessage[]> {
  const { client } = useXmtp();
  const { data: conversation } = useConversation({ topic });
  return useQuery<DecodedMessage[]>(
    ["xmtp", "messages", client?.address, conversation?.topic],
    () => conversation!.messages(),
    {
      enabled: !!client && !!topic && !!conversation,
    },
  );
}

/**
 * Get the reactions to the messages in the conversation identified by `topic`.
 *
 * Note: this is better done with a DB, but we're using react-query for now.
 */
export function useReactions({ topic }: { topic: string }) {
  const { client } = useXmtp();
  const { data: messages } = useMessages({ topic });
  let reactions = (messages || []).filter(({ content }) => content.reaction);
  return useQuery<{
    [messageId: string]: {
      reaction: string;
      count: number;
      includesMe: boolean;
    }[];
  }>(
    ["xmtp", "reactions", client?.address, topic, reactions.length],
    () => {
      // SELECT messageId, reaction, senderAddress FROM reactions GROUP BY messageId, reaction
      let byId = {} as {
        [messageId: string]: { [reaction: string]: string[] };
      };
      // Reverse so we apply them in chronological order (adding/removing)
      reactions
        .slice()
        .reverse()
        .forEach(({ id, senderAddress, content: { reaction } }) => {
          let messageId = reaction!.reference;
          let reactionText = reaction!.content;
          let v = byId[messageId] || ({} as { [reaction: string]: string[] });
          // DELETE FROM reactions WHERE messageId = ? AND reaction = ? AND senderAddress = ?
          let prior = (v[reactionText] || [])
            // This removes any prior instances of the sender using this reaction.
            .filter((address) => address !== senderAddress);
          if (reaction!.action === "added") {
            // INSERT INTO reactions (messageId, reaction, senderAddress) VALUES (?, ?, ?)
            prior = prior.concat([senderAddress]);
          }
          v[reactionText] = prior;
          byId[messageId] = v;
        });
      // SELECT messageId, reaction, COUNT(*) AS count, COUNT(senderAddress = ?) AS includesMe
      // FROM reactions
      // GROUP BY messageId, reaction
      // ORDER BY count DESC
      let result = {} as {
        [messageId: string]: {
          reaction: string;
          count: number;
          includesMe: boolean;
        }[];
      };
      Object.keys(byId).forEach((messageId) => {
        let reactions = byId[messageId];
        result[messageId] = Object.keys(reactions)
          .map((reaction) => {
            let addresses = reactions[reaction];
            return {
              reaction,
              count: addresses.length,
              includesMe: addresses.includes(client!.address),
            };
          })
          .filter(({ count }) => count > 0)
          .sort((a, b) => b.count - a.count);
      });
      return result;
    },
    {
      enabled: !!reactions.length,
    },
  );
}

/**
 * Load or save a keyBundle for future use.
 */
export function useSavedKeys(): {
  keyBundle: string | null | undefined;
  save: (keyBundle: string) => void;
  clear: () => void;
} {
  let { data: keyBundle, refetch } = useQuery<string | null>(
    ["xmtp", "keyBundle"],
    () => EncryptedStorage.getItem("xmtp.keyBundle"),
  );
  return {
    keyBundle,
    save: async (keyBundle: string) => {
      await EncryptedStorage.setItem("xmtp.keyBundle", keyBundle);
      await refetch();
    },
    clear: async () => {
      await EncryptedStorage.removeItem("xmtp.keyBundle");
      await refetch();
    },
  };
}
