import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { NavigationParamList } from "./Navigation";
import {
  Alert,
  Button,
  FlatList,
  Modal,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  TouchableHighlight,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import React, { useState } from "react";
import { useConversation, useMessages, useReactions } from "./hooks";
import { DecodedMessage, MessageContent } from "xmtp-react-native-sdk";
import moment from "moment";
import { useXmtp } from "./XmtpContext";

/// Show the messages in a conversation.
export default function ConversationScreen({
  route,
}: NativeStackScreenProps<NavigationParamList, "conversation">) {
  let { topic } = route.params;
  let {
    data: messages,
    refetch: refreshMessages,
    isFetching,
    isRefetching,
  } = useMessages({ topic });
  let { data: reactions } = useReactions({ topic });
  let { data: conversation } = useConversation({ topic });
  let [text, setText] = useState("");
  let [isSending, setSending] = useState(false);

  messages = (messages || []).filter(({ content }) => !content.reaction);
  const sendMessage = async (content: string | MessageContent) => {
    setSending(true);
    console.log("Sending message", content);
    try {
      await conversation!.send(content);
      await refreshMessages();
    } catch (e) {
      console.log("Error sending message", e);
    } finally {
      setSending(false);
    }
  };
  const sendTextMessage = () => sendMessage({ text }).then(() => setText(""));
  // const sendAttachment = () => sendMessage({
  //     attachment: {
  //         mimeType: "text/plain",
  //         filename: "hello.txt",
  //         data: new Buffer("Hello Hello Hello Hello Hello Hello").toString("base64"),
  //     }
  // });
  return (
    <FlatList
      refreshing={isFetching || isRefetching}
      onRefresh={refreshMessages}
      data={messages}
      inverted
      keyExtractor={(message) => message.id}
      ItemSeparatorComponent={() => <View style={{ height: 4 }} />}
      renderItem={({ item: message, index }) => (
        <MessageItem
          topic={topic}
          message={message}
          reactions={reactions?.[message.id] || []}
          showSender={
            index === (messages || []).length - 1 ||
            (index + 1 < (messages || []).length &&
              messages![index + 1].senderAddress !== message.senderAddress)
          }
        />
      )}
      ListHeaderComponent={
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <TextInput
            onSubmitEditing={sendTextMessage}
            editable={!isSending}
            value={text}
            onChangeText={setText}
            style={{
              height: 40,
              margin: 12,
              marginRight: 0,
              borderWidth: 1,
              padding: 10,
              backgroundColor: "white",
              flexGrow: 1,
              opacity: isSending ? 0.5 : 1,
            }}
          />
          <Button
            title="Send"
            onPress={sendTextMessage}
            disabled={isSending || !conversation || !text.length}
          />
        </View>
      }
    />
  );
}

function PillButton({
  highlighted,
  style,
  onPress,
  children,
}: {
  highlighted?: boolean;
  style?: {};
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <TouchableHighlight
      style={{
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: 4,
        borderColor: highlighted ? "#aa9" : "#aaa",
        backgroundColor: highlighted ? "#ffd" : "#fff",
        padding: 3,
        ...style,
      }}
      onPress={onPress}
    >
      <View
        style={{
          backgroundColor: "transparent",
          flexDirection: "row",
          alignItems: "center",
        }}
      >
        {children}
      </View>
    </TouchableHighlight>
  );
}

function ReactionModal({
  onRequestClose,
  onReaction,
  visible,
}: {
  onRequestClose: () => void;
  onReaction: (reaction: string) => void;
  visible: boolean;
}) {
  return (
    <Modal transparent visible={visible} onRequestClose={onRequestClose}>
      <TouchableWithoutFeedback onPress={onRequestClose}>
        <View
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: 0,
            right: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
          }}
        />
      </TouchableWithoutFeedback>
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          margin: "5%",
        }}
      >
        <View
          style={{
            margin: 20,
            backgroundColor: "#f1f1f1",
            borderRadius: 4,
            padding: 24,
            alignItems: "center",
            shadowColor: "#000",
            shadowOffset: {
              width: 0,
              height: 2,
            },
            shadowOpacity: 0.25,
            shadowRadius: 4,
            elevation: 5,
            flexDirection: "row",
            justifyContent: "space-around",
          }}
        >
          {["👍", "👋", "❤️", "👎"].map((reaction) => (
            <PillButton
              key={`reaction-${reaction}`}
              style={{
                borderWidth: 0,
                borderRadius: 8,
                backgroundColor: "#fff",
              }}
              onPress={() => onReaction(reaction)}
            >
              <Text style={{ fontSize: 32, padding: 4 }}>{reaction}</Text>
            </PillButton>
          ))}
        </View>
      </View>
    </Modal>
  );
}

function MessageReactions({
  reactions,
  onAddReaction,
  onRemoveReaction,
  onNewReaction,
}: {
  reactions: { reaction: string; count: number; includesMe: boolean }[];
  onAddReaction: (reaction: string) => void;
  onRemoveReaction: (reaction: string) => void;
  onNewReaction: () => void;
}) {
  if (!reactions || reactions.length === 0) {
    return null;
  }
  return (
    <View
      style={{
        flexDirection: "row",
        paddingVertical: 4,
        gap: 8,
        alignItems: "center",
      }}
    >
      {(reactions || []).map(({ reaction, count, includesMe }) => (
        <PillButton
          key={`reaction-${reaction}`}
          highlighted={includesMe}
          onPress={() =>
            includesMe ? onRemoveReaction(reaction) : onAddReaction(reaction)
          }
        >
          <Text style={{ paddingLeft: 4, paddingRight: 2 }}>{reaction}</Text>
          <Text style={{ paddingLeft: 2, paddingRight: 4 }}>{count}</Text>
        </PillButton>
      ))}
      <PillButton onPress={onNewReaction}>
        <Text style={{ paddingLeft: 8, paddingRight: 8, opacity: 0.5 }}>+</Text>
      </PillButton>
    </View>
  );
}

function MessageItem({
  topic,
  message,
  reactions,
  showSender,
}: {
  topic: string;
  message: DecodedMessage;
  reactions?: { reaction: string; count: number; includesMe: boolean }[];
  showSender: boolean;
}) {
  let [showNewReaction, setShowNewReaction] = useState(false);
  let { data: conversation } = useConversation({ topic });
  let { refetch: refreshMessages } = useMessages({ topic });
  let { client } = useXmtp();
  let isSenderMe = message.senderAddress === client?.address;
  const performReaction = (action: "added" | "removed", content: string) => {
    conversation
      ?.send({
        reaction: {
          reference: message.id,
          action,
          schema: "unicode",
          content,
        },
      })
      .then(() => {
        setShowNewReaction(false);
        refreshMessages().catch((err) =>
          console.log("Error refreshing messages", err),
        );
      });
  };
  return (
    <TouchableHighlight
      onLongPress={() => setShowNewReaction(true)}
      underlayColor="#eee"
    >
      <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
        {showSender ? (
          <View
            style={{
              marginLeft: 12,
              marginRight: 12,
              marginTop: 8,
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor: isSenderMe ? "green" : "gray",
            }}
          />
        ) : (
          <View style={{ width: 32, marginLeft: 12, marginRight: 12 }} />
        )}
        <View>
          {showSender && (
            <View
              style={{
                flexDirection: "row",
                marginTop: 8,
                gap: 8,
                alignItems: "flex-start",
              }}
            >
              <Text style={{ fontWeight: "bold" }}>
                {message.senderAddress.slice(0, 6)}…
                {message.senderAddress.slice(-4)}
              </Text>
              <Text style={{ fontWeight: "300" }}>
                {moment(message.sent).fromNow()}
              </Text>
            </View>
          )}
          <MessageContents message={message} />
          <MessageReactions
            reactions={reactions || []}
            onAddReaction={(reaction) => performReaction("added", reaction)}
            onRemoveReaction={(reaction) =>
              performReaction("removed", reaction)
            }
            onNewReaction={() => setShowNewReaction(true)}
          />
          <ReactionModal
            onRequestClose={() => setShowNewReaction(false)}
            visible={showNewReaction}
            onReaction={(reaction) => performReaction("added", reaction)}
          />
        </View>
      </View>
    </TouchableHighlight>
  );
}

function MessageContents({ message }: { message: DecodedMessage }) {
  if (message.content.text) {
    return (
      <>
        <Text>{message.content.text}</Text>
      </>
    );
  }
  if (message.content.attachment) {
    return (
      <>
        <Text style={{ fontStyle: "italic" }}>
          Attachment: {message.content.attachment.filename} (
          {message.content.attachment.mimeType}) (
          {new Buffer(message.content.attachment.data, "base64").length} bytes)
        </Text>
      </>
    );
  }
  // console.log("unsupported content", message.content);
  return (
    <>
      <Text style={{ opacity: 0.5, fontStyle: "italic" }}>
        unsupported message content
      </Text>
    </>
  );
}
