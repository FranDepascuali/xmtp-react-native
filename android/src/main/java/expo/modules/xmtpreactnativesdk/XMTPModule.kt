package expo.modules.xmtpreactnativesdk

import android.util.Base64
import android.util.Base64.NO_WRAP
import android.util.Log
import com.google.protobuf.kotlin.toByteString
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.xmtpreactnativesdk.wrappers.ConversationWithClientAddress
import expo.modules.xmtpreactnativesdk.wrappers.ConversationWrapper
import expo.modules.xmtpreactnativesdk.wrappers.ContentJson
import expo.modules.xmtpreactnativesdk.wrappers.DecodedMessageWrapper
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import org.json.JSONObject
import org.xmtp.android.library.Client
import org.xmtp.android.library.ClientOptions
import org.xmtp.android.library.Conversation
import org.xmtp.android.library.SendOptions
import org.xmtp.android.library.SigningKey
import org.xmtp.android.library.XMTPEnvironment
import org.xmtp.android.library.XMTPException
import org.xmtp.android.library.messages.EnvelopeBuilder
import org.xmtp.android.library.messages.InvitationV1ContextBuilder
import org.xmtp.android.library.messages.Pagination
import org.xmtp.android.library.messages.PrivateKeyBuilder
import org.xmtp.android.library.messages.Signature
import org.xmtp.android.library.push.XMTPPush
import org.xmtp.proto.keystore.api.v1.Keystore.TopicMap.TopicData
import org.xmtp.proto.message.contents.Content.EncodedContent
import org.xmtp.proto.message.contents.PrivateKeyOuterClass
import org.xmtp.proto.message.contents.SignatureOuterClass
import java.util.Date
import java.util.UUID
import kotlin.coroutines.Continuation
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

class ReactNativeSigner(var module: XMTPModule, override var address: String) : SigningKey {
    private val continuations: MutableMap<String, Continuation<Signature>> = mutableMapOf()

    fun handle(id: String, signature: String) {
        val continuation = continuations[id] ?: return
        val signatureData = Base64.decode(signature.toByteArray(), NO_WRAP)
        if (signatureData == null || signatureData.size != 65) {
            continuation.resumeWithException(XMTPException("Invalid Signature"))
            continuations.remove(id)
            return
        }
        val sig = SignatureOuterClass.Signature.newBuilder().also {
            it.ecdsaCompact = it.ecdsaCompact.toBuilder().also { builder ->
                builder.bytes = signatureData.take(64).toByteArray().toByteString()
                builder.recovery = signatureData[64].toInt()
            }.build()
        }.build()
        continuation.resume(sig)
        continuations.remove(id)
    }

    override suspend fun sign(data: ByteArray): Signature {
        val request = SignatureRequest(message = String(data, Charsets.UTF_8))
        module.sendEvent("sign", mapOf("id" to request.id, "message" to request.message))
        return suspendCancellableCoroutine { continuation ->
            continuations[request.id] = continuation
        }
    }

    override suspend fun sign(message: String): Signature =
        sign(message.toByteArray())
}

data class SignatureRequest(
    var id: String = UUID.randomUUID().toString(),
    var message: String,
)

fun Conversation.cacheKey(clientAddress: String): String {
    return "${clientAddress}:${topic}"
}

fun Conversation.ephemeralCacheKey(clientAddress: String): String {
    return "${clientAddress}:${topic}:ephemeral"
}

class XMTPModule : Module() {
    private fun apiEnvironments(env: String, appVersion: String?): ClientOptions.Api {
        return when (env) {
            "local" -> ClientOptions.Api(
                env = XMTPEnvironment.LOCAL,
                isSecure = false,
                appVersion = appVersion
            )

            "production" -> ClientOptions.Api(
                env = XMTPEnvironment.PRODUCTION,
                isSecure = true,
                appVersion = appVersion
            )

            else -> ClientOptions.Api(
                env = XMTPEnvironment.DEV,
                isSecure = true,
                appVersion = appVersion
            )
        }
    }

    private var clients: MutableMap<String, Client> = mutableMapOf()
    private var xmtpPush: XMTPPush? = null
    private var signer: ReactNativeSigner? = null
    private val isDebugEnabled = BuildConfig.DEBUG; // TODO: consider making this configurable
    private val conversations: MutableMap<String, Conversation> = mutableMapOf()
    private val subscriptions: MutableMap<String, Job> = mutableMapOf()

    override fun definition() = ModuleDefinition {
        Name("XMTP")
        Events("sign", "authed", "conversation", "message", "ephemeral-message")

        Function("address") { clientAddress: String ->
            logV("address")
            val client = clients[clientAddress]
            client?.address ?: "No Client."
        }

        //
        // Auth functions
        //
        AsyncFunction("auth") { address: String, environment: String, appVersion: String? ->
            logV("auth")
            val reactSigner = ReactNativeSigner(module = this@XMTPModule, address = address)
            signer = reactSigner
            val options = ClientOptions(api = apiEnvironments(environment, appVersion))
            clients[address] = Client().create(account = reactSigner, options = options)
            signer = null
            sendEvent("authed")
        }

        Function("receiveSignature") { requestID: String, signature: String ->
            logV("receiveSignature")
            signer?.handle(id = requestID, signature = signature)
        }

        // Generate a random wallet and set the client to that
        AsyncFunction("createRandom") { environment: String, appVersion: String? ->
            logV("createRandom")
            val privateKey = PrivateKeyBuilder()
            val options = ClientOptions(api = apiEnvironments(environment, appVersion))
            val randomClient = Client().create(account = privateKey, options = options)
            clients[randomClient.address] = randomClient
            randomClient.address
        }

        AsyncFunction("createFromKeyBundle") { keyBundle: String, environment: String, appVersion: String? ->
            try {
                logV("createFromKeyBundle")
                val options = ClientOptions(api = apiEnvironments(environment, appVersion))
                val bundle =
                    PrivateKeyOuterClass.PrivateKeyBundle.parseFrom(
                        Base64.decode(
                            keyBundle,
                            NO_WRAP
                        )
                    )
                val client = Client().buildFromBundle(bundle = bundle, options = options)
                clients[client.address] = client
                client.address
            } catch (e: Exception) {
                throw XMTPException("Failed to create client: $e")
            }
        }

        AsyncFunction("exportKeyBundle") { clientAddress: String ->
            logV("exportKeyBundle")
            val client = clients[clientAddress] ?: throw XMTPException("No client")
            Base64.encodeToString(client.privateKeyBundle.toByteArray(), NO_WRAP)
        }

        // Export the conversation's serialized topic data.
        AsyncFunction("exportConversationTopicData") { clientAddress: String, topic: String ->
            logV("exportConversationTopicData")
            val client = clients[clientAddress] ?: throw XMTPException("No client")
            val conversation = findConversation(clientAddress, topic)
                ?: throw XMTPException("no conversation found for $topic")
            Base64.encodeToString(conversation.toTopicData().toByteArray(), NO_WRAP)
        }

        // Import a conversation from its serialized topic data.
        AsyncFunction("importConversationTopicData") { clientAddress: String, topicData: String ->
            logV("importConversationTopicData")
            val client = clients[clientAddress] ?: throw XMTPException("No client")
            val data = TopicData.parseFrom(Base64.decode(topicData, NO_WRAP))
            val conversation = client.conversations.importTopicData(data)
            conversations[conversation.cacheKey(clientAddress)] = conversation
            ConversationWrapper.encode(ConversationWithClientAddress(client, conversation))
        }

        //
        // Client API
        AsyncFunction("canMessage") { clientAddress: String, peerAddress: String ->
            logV("canMessage")
            val client = clients[clientAddress] ?: throw XMTPException("No client")

            client.canMessage(peerAddress)
        }

        AsyncFunction("listConversations") { clientAddress: String ->
            logV("listConversations")
            val client = clients[clientAddress] ?: throw XMTPException("No client")
            val conversationList = client.conversations.list()
            conversationList.map { conversation ->
                conversations[conversation.cacheKey(clientAddress)] = conversation
                ConversationWrapper.encode(ConversationWithClientAddress(client, conversation))
            }
        }

        AsyncFunction("loadMessages") { clientAddress: String, topic: String, limit: Int?, before: Long?, after: Long? ->
            logV("loadMessages")
            val conversation =
                findConversation(
                    clientAddress = clientAddress,
                    topic = topic,
                ) ?: throw XMTPException("no conversation found for $topic")
            val beforeDate = if (before != null) Date(before) else null
            val afterDate = if (after != null) Date(after) else null

            conversation.messages(limit = limit, before = beforeDate, after = afterDate)
                .map { DecodedMessageWrapper.encode(it) }
        }

        AsyncFunction("loadBatchMessages") { clientAddress: String, topics: List<String> ->
            logV("loadBatchMessages")
            val client = clients[clientAddress] ?: throw XMTPException("No client")
            val topicsList = mutableListOf<Pair<String, Pagination>>()
            topics.forEach {
                val jsonObj = JSONObject(it)
                val topic = jsonObj.get("topic").toString()
                var limit: Int? = null
                var before: Long? = null
                var after: Long? = null

                try {
                    limit = jsonObj.get("limit").toString().toInt()
                    before = jsonObj.get("before").toString().toLong()
                    after = jsonObj.get("after").toString().toLong()
                } catch (e: Exception) {
                    Log.e(
                        "XMTPModule",
                        "Pagination given incorrect information ${e.message}"
                    )
                }

                val page = Pagination(
                    limit = if (limit != null && limit > 0) limit else null,
                    before = if (before != null && before > 0) Date(before) else null,
                    after = if (after != null && after > 0) Date(after) else null
                )

                topicsList.add(Pair(topic, page))
            }

            client.conversations.listBatchMessages(topicsList)
                .map { DecodedMessageWrapper.encode(it) }
        }

        AsyncFunction("sendMessage") { clientAddress: String, conversationTopic: String, conversationID: String?, contentJson: String, ephemeral: Boolean ->
            logV("sendMessage")
            val conversation =
                findConversation(
                    clientAddress = clientAddress,
                    topic = conversationTopic
                )
                    ?: throw XMTPException("no conversation found for $conversationTopic")
            val sending = ContentJson.fromJson(contentJson)
            conversation.send(
                content = sending.content,
                options = SendOptions(contentType = sending.type, ephemeral = ephemeral)
            )
        }

        AsyncFunction("createConversation") { clientAddress: String, peerAddress: String, conversationID: String? ->
            logV("createConversation")
            val client = clients[clientAddress] ?: throw XMTPException("No client")

            val conversation = client.conversations.newConversation(
                peerAddress,
                context = InvitationV1ContextBuilder.buildFromConversation(
                    conversationId = conversationID ?: "", metadata = mapOf()
                )
            )
            ConversationWrapper.encode(ConversationWithClientAddress(client, conversation))
        }

        Function("subscribeToConversations") { clientAddress: String ->
            logV("subscribeToConversations")
            subscribeToConversations(clientAddress = clientAddress)
        }

        Function("subscribeToAllMessages") { clientAddress: String ->
            logV("subscribeToAllMessages")
            subscribeToAllMessages(clientAddress = clientAddress)
        }

        AsyncFunction("subscribeToMessages") { clientAddress: String, topic: String, conversationID: String? ->
            logV("subscribeToMessages")
            subscribeToMessages(
                clientAddress = clientAddress,
                topic = topic,
                conversationId = conversationID
            )
        }

        AsyncFunction("subscribeToEphemeralMessages") { clientAddress: String, topic: String, conversationID: String? ->
            logV("subscribeToEphemeralMessages")
            subscribeToEphemeralMessages(
                clientAddress = clientAddress,
                topic = topic,
                conversationId = conversationID
            )
        }

        AsyncFunction("unsubscribeFromEphemeralMessages") { clientAddress: String, topic: String, conversationID: String? ->
            logV("unsubscribeFromEphemeralMessages")
            unsubscribeFromEphemeralMessages(
                clientAddress = clientAddress,
                topic = topic,
                conversationId = conversationID
            )
        }

        AsyncFunction("unsubscribeFromMessages") { clientAddress: String, topic: String, conversationID: String? ->
            logV("unsubscribeFromMessages")
            unsubscribeFromMessages(
                clientAddress = clientAddress,
                topic = topic,
                conversationId = conversationID
            )
        }

        Function("registerPushToken") { pushServer: String, token: String ->
            logV("registerPushToken")
            xmtpPush = XMTPPush(appContext.reactContext!!, pushServer)
            xmtpPush?.register(token)
        }

        Function("subscribePushTopics") { topics: List<String> ->
            logV("subscribePushTopics")
            if (topics.isNotEmpty()) {
                if (xmtpPush == null) {
                    throw XMTPException("Push server not registered")
                }
                xmtpPush?.subscribe(topics)
            }
        }

        AsyncFunction("decodeMessage") { clientAddress: String, topic: String, encryptedMessage: String, conversationID: String? ->
            logV("decodeMessage")
            val encryptedMessageData = Base64.decode(encryptedMessage, Base64.NO_WRAP)
            val envelope = EnvelopeBuilder.buildFromString(topic, Date(), encryptedMessageData)
            val conversation =
                findConversation(
                    clientAddress = clientAddress,
                    topic = topic
                )
                    ?: throw XMTPException("no conversation found for $topic")
            val decodedMessage = conversation.decode(envelope)
            DecodedMessageWrapper.encode(decodedMessage)
        }
    }

    //
    // Helpers
    //
    private fun findConversation(
        clientAddress: String,
        topic: String,
    ): Conversation? {
        val client = clients[clientAddress] ?: throw XMTPException("No client")

        val cacheKey = "${clientAddress}:${topic}"
        val cacheConversation = conversations[cacheKey]
        if (cacheConversation != null) {
            return cacheConversation
        } else {
            val conversation = client.conversations.list()
                .firstOrNull { it.topic == topic }
            if (conversation != null) {
                conversations[conversation.cacheKey(clientAddress)] = conversation
                return conversation
            }
        }
        return null
    }

    private fun subscribeToConversations(clientAddress: String) {
        val client = clients[clientAddress] ?: throw XMTPException("No client")

        subscriptions["conversations"] = CoroutineScope(Dispatchers.IO).launch {
            try {
                client!!.conversations.stream().collect { conversation ->
                    sendEvent(
                        "conversation",
                        mapOf(
                            "topic" to conversation.topic,
                            "peerAddress" to conversation.peerAddress,
                            "version" to if (conversation.version == Conversation.Version.V1) "v1" else "v2",
                            "conversationID" to conversation.conversationId
                        )
                    )
                }
            } catch (e: Exception) {
                Log.e("XMTPModule", "Error in conversations subscription: $e")
                subscriptions["conversations"]?.cancel()
            }
        }
    }

    private fun subscribeToAllMessages(clientAddress: String) {
        val client = clients[clientAddress] ?: throw XMTPException("No client")

        subscriptions["messages"] = CoroutineScope(Dispatchers.IO).launch {
            try {
                client!!.conversations.streamAllMessages().collect { message ->
                    sendEvent(
                        "message",
                        mapOf(
                            "id" to message.id,
                            "content" to message.body,
                            "senderAddress" to message.senderAddress,
                            "sent" to message.sent
                        )
                    )
                }
            } catch (e: Exception) {
                Log.e("XMTPModule", "Error in all messages subscription: $e")
                subscriptions["messages"]?.cancel()
            }
        }
    }

    private fun subscribeToMessages(clientAddress: String, topic: String, conversationId: String?) {
        val conversation =
            findConversation(
                clientAddress = clientAddress,
                topic = topic
            ) ?: return
        subscriptions[conversation.cacheKey(clientAddress)] =
            CoroutineScope(Dispatchers.IO).launch {
                try {
                    conversation.streamMessages().collect { message ->
                        sendEvent(
                            "message",
                            mapOf(
                                "topic" to conversation.topic,
                                "conversationID" to conversation.conversationId,
                                "messageJSON" to DecodedMessageWrapper.encode(message)
                            )
                        )
                    }
                } catch (e: Exception) {
                    Log.e("XMTPModule", "Error in messages subscription: $e")
                    subscriptions[conversation.cacheKey(clientAddress)]?.cancel()
                }
            }
    }

    private fun subscribeToEphemeralMessages(clientAddress: String, topic: String, conversationId: String?) {
        val conversation =
            findConversation(
                clientAddress = clientAddress,
                topic = topic
            ) ?: return
        subscriptions[conversation.ephemeralCacheKey(clientAddress)] =
            CoroutineScope(Dispatchers.IO).launch {
                try {
                    conversation.streamEphemeral().collect { envelop ->
                        val message = conversation.decode(envelop)
                        sendEvent(
                            "ephemeral-message",
                            mapOf(
                                "topic" to conversation.topic,
                                "conversationID" to conversation.conversationId,
                                "messageJSON" to DecodedMessageWrapper.encode(message)
                            )
                        )
                    }
                } catch (e: Exception) {
                    Log.e("XMTPModule", "Error in ephemeral messages subscription: $e")
                    subscriptions[conversation.ephemeralCacheKey(clientAddress)]?.cancel()
                }
            }
    }

    private fun unsubscribeFromEphemeralMessages(
        clientAddress: String,
        topic: String,
        conversationId: String?,
    ) {
        val conversation =
            findConversation(
                clientAddress = clientAddress,
                topic = topic
            ) ?: return
        subscriptions[conversation.ephemeralCacheKey(clientAddress)]?.cancel()
    }

    private fun unsubscribeFromMessages(
        clientAddress: String,
        topic: String,
        conversationId: String?,
    ) {
        val conversation =
            findConversation(
                clientAddress = clientAddress,
                topic = topic
            ) ?: return
        subscriptions[conversation.cacheKey(clientAddress)]?.cancel()
    }

    private fun logV(msg: String) {
        if (isDebugEnabled) {
            Log.v("XMTPModule", msg);
        }
    }
}


