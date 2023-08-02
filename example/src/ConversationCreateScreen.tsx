import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { NavigationParamList } from "./Navigation";
import {
  Button,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
} from "react-native";
import React, { useMemo, useState } from "react";
import { useXmtp } from "./XmtpContext";

export default function ConversationCreateScreen({
  route,
  navigation,
}: NativeStackScreenProps<NavigationParamList, "conversationCreate">) {
  const [toAddress, setToAddress] = useState<string>("");
  const [alert, setAlert] = useState<string>("");
  const [isCreating, setCreating] = useState<boolean>(false);
  const { client } = useXmtp();
  const startNewConversation = async (toAddress: string) => {
    if (!client) {
      setAlert("Client not initialized");
      return;
    }
    let canMessage = await client.canMessage(toAddress);
    if (!canMessage) {
      setAlert(`${toAddress} is not on the XMTP network yet`);
      return;
    }
    let convo = await client.conversations.newConversation(toAddress);
    navigation.navigate("conversation", { topic: convo.topic });
  };
  return (
    <>
      <ScrollView>
        <Text>New conversation</Text>
        <TextInput
          value={toAddress}
          onChangeText={(text) => {
            setToAddress(text);
            setAlert(""); // clear any previous alert
          }}
          editable={!isCreating}
          style={{
            height: 40,
            margin: 12,
            marginRight: 0,
            borderWidth: 1,
            padding: 10,
            backgroundColor: "white",
            flexGrow: 1,
            opacity: isCreating ? 0.5 : 1,
          }}
        />
        {alert && <Text>{alert}</Text>}
        <Button
          title="Start conversation"
          onPress={() => {
            setCreating(true);
            setAlert("");
            startNewConversation(toAddress)
              .catch((err) => setAlert(err.message))
              .finally(() => setCreating(false));
          }}
          disabled={isCreating}
        />
      </ScrollView>
    </>
  );
}
