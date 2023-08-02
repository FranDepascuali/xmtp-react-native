import { ThirdwebProvider } from "@thirdweb-dev/react-native";
import React from "react";

import LaunchScreen from "./src/LaunchScreen";
import TestScreen from "./src/TestScreen";
import HomeScreen from "./src/HomeScreen";
import ConversationScreen from "./src/ConversationScreen";
import ConversationCreateScreen from "./src/ConversationCreateScreen";
import { NavigationContainer } from "@react-navigation/native";
import { XmtpContextProvider } from "./src/XmtpContext";
import { Navigator } from "./src/Navigation";
import { QueryClient, QueryClientProvider } from "react-query";

const queryClient = new QueryClient();
export default function App() {
  return (
    <ThirdwebProvider activeChain="mainnet">
      <QueryClientProvider client={queryClient}>
        <XmtpContextProvider>
          <NavigationContainer>
            <Navigator.Navigator>
              <Navigator.Screen
                name="launch"
                component={LaunchScreen}
                options={{ title: "XMTP RN Example" }}
              />
              <Navigator.Screen
                name="test"
                component={TestScreen}
                options={{ title: "Unit Tests" }}
              />
              <Navigator.Screen
                name="home"
                component={HomeScreen}
                options={{ title: "My Conversations" }}
              />
              <Navigator.Screen
                name="conversation"
                component={ConversationScreen}
                options={{ title: "Conversation" }}
                initialParams={{ topic: "" }}
              />
              <Navigator.Screen
                name="conversationCreate"
                component={ConversationCreateScreen}
                options={{ title: "New Conversation" }}
              />
            </Navigator.Navigator>
          </NavigationContainer>
        </XmtpContextProvider>
      </QueryClientProvider>
    </ThirdwebProvider>
  );
}
