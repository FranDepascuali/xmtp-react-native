import { usePrevious } from "./usePrevious"

export enum TypingStatus {
  typing = "typing",
  notTyping = "not_typing",
}

export const useTypingStatus = (text: string): TypingStatus | undefined => {
  const isTyping = text.length > 0

  const wasTyping = usePrevious(isTyping) ?? false

  // NOTE: this logic actually depends on what we want to do
  // The pros of this approach is that we only send one message when the user starts typing
  // and one message when the user stops typing
  // The cons of this approach is that if the receiver leaves the conversation
  // and comes back, they will not receive the startedTyping message again
  if (isTyping && !wasTyping) {
    return TypingStatus.typing
  }

  if (!isTyping && wasTyping) {
    return TypingStatus.notTyping
  }
}