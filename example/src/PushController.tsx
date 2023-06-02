import { useEffect } from "react";
import PushNotificationIOS from "@react-native-community/push-notification-ios";
import PushNotification, { Importance } from "react-native-push-notification";
import { XMTPPush, Client } from "xmtp-react-native-sdk";

function PushController({ client }: { client: Client }) {
  useEffect(() => {
    PushNotification.configure({
      // (optional) Called when Token is generated (iOS and Android)
      onRegister(token: any) {
        XMTPPush.register("YOUR_SERVER_ADDRESS", token.token as string);
        PushNotification.createChannel({
          channelId: "xmtp-react-native-example-dm", // (required)
          channelName: "XMTP React Native Example", // (required)
        });
      },
      // (required) Called when a remote or local notification is opened or received
      onNotification(notification: any) {
        const encryptedMessage = notification.data.encryptedMessage;
        const topic = notification.data.topic;

        if (encryptedMessage == null || topic == null) {
          return;
        }
        (async () => {
          const conversations = await client.conversations.list();
          const conversation = conversations.find(
            (c: { topic: string }) => c.topic === topic
          );
          if (conversation == null) {
            return;
          }

          const peerAddress = conversation.peerAddress;
          const decodedMessage = await conversation.decodeMessage(
            encryptedMessage
          );
          const body = decodedMessage.content;

          PushNotification.localNotification({
            /* Android Only Properties */
            channelId: "xmtp-react-native-example-dm", // (required) channelId, if the channel doesn't exist, notification will not trigger.
            messageId: "google:message_id", // (optional) added as `message_id` to intent extras so opening push notification can find data stored by @react-native-firebase/messaging module.

            /* iOS only properties */
            category: "", // (optional) default: empty string
            subtitle: "My Notification Subtitle", // (optional) smaller title below notification title

            /* iOS and Android properties */
            id: 0, // (optional) Valid unique 32 bit integer specified as string. default: Autogenerated Unique ID
            title: peerAddress, // (optional)
            message: body, // (required)
          });
        })();

        // process the notification here
        // required on iOS only
        notification.finish(PushNotificationIOS?.FetchResult.NoData);
      },
      // Android only
      senderID: "YOUR_FIREBASE_SENDER_ID",
      // iOS only
      permissions: {
        alert: true,
        badge: true,
        sound: true,
      },
      popInitialNotification: true,
      requestPermissions: true,
    });
  });
  return null;
}
export default PushController;