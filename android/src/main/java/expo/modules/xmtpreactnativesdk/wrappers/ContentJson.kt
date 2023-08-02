package expo.modules.xmtpreactnativesdk.wrappers

import android.util.Base64
import com.google.gson.GsonBuilder
import com.google.gson.JsonParser
import com.google.protobuf.ByteString
import org.xmtp.android.library.Client
import org.xmtp.android.library.DecodedMessage
import org.xmtp.proto.message.contents.Content.EncodedContent
import org.xmtp.android.library.codecs.decoded
import org.xmtp.android.library.codecs.ContentTypeAttachment
import org.xmtp.android.library.codecs.ContentTypeId
import org.xmtp.android.library.codecs.ContentTypeReaction
import org.xmtp.android.library.codecs.ContentTypeText
import org.xmtp.android.library.codecs.AttachmentCodec
import org.xmtp.android.library.codecs.Attachment
import org.xmtp.android.library.codecs.ReactionAction
import org.xmtp.android.library.codecs.ReactionSchema
import org.xmtp.android.library.codecs.ReactionCodec
import org.xmtp.android.library.codecs.Reaction
import org.xmtp.android.library.codecs.TextCodec
import org.xmtp.android.library.codecs.id

import java.lang.Exception

class ContentJson(
    val type: ContentTypeId,
    val content: Any?,
) {
    constructor(encoded: EncodedContent) : this(
        type = encoded.type,
        content = encoded.decoded(),
    );

    companion object {
        init {
            Client.register(TextCodec())
            Client.register(AttachmentCodec())
            Client.register(ReactionCodec())
            // TODO:
            //Client.register(ReplyCodec())
            //Client.register(CompositeCodec())
            //Client.register(GroupChatMemberAddedCodec())
            //Client.register(GroupChatTitleChangedCodec())
            //Client.register(RemoteAttachmentCodec())
        }

        fun fromJson(json: String): ContentJson {
            val obj = JsonParser.parseString(json).asJsonObject
            if (obj.has("text")) {
                return ContentJson(ContentTypeText, obj.get("text").asString)
            } else if (obj.has("attachment")) {
                val attachment = obj.get("attachment").asJsonObject
                return ContentJson(ContentTypeAttachment, Attachment(
                    filename = attachment.get("filename").asString,
                    mimeType = attachment.get("mimeType").asString,
                    data = ByteString.copyFrom(bytesFrom64(attachment.get("data").asString)),
                ))
            } else if (obj.has("reaction")) {
                val reaction = obj.get("reaction").asJsonObject
                return ContentJson(ContentTypeReaction, Reaction(
                    reference = reaction.get("reference").asString,
                    action = ReactionAction.valueOf(reaction.get("action").asString),
                    schema = ReactionSchema.valueOf(reaction.get("schema").asString),
                    content = reaction.get("content").asString,
                ))
            } else {
                throw Exception("Unknown content type")
            }
        }

        fun bytesFrom64(bytes64: String): ByteArray = Base64.decode(bytes64, Base64.DEFAULT)
        fun bytesTo64(bytes: ByteArray): String = Base64.encodeToString(bytes, Base64.DEFAULT)
    }

    fun toJsonMap(): Map<String, Any> {
        return when (type.id) {
            ContentTypeText.id -> mapOf(
                "text" to (content as String? ?: ""),
            )

            ContentTypeAttachment.id -> mapOf(
                "attachment" to mapOf(
                    "filename" to (content as Attachment).filename,
                    "mimeType" to content.mimeType,
                    "data" to bytesTo64(content.data.toByteArray()),
                )
            )

            ContentTypeReaction.id -> mapOf(
                "reaction" to mapOf(
                    "reference" to (content as Reaction).reference,
                    "action" to content.action,
                    "schema" to content.schema,
                    "content" to content.content,
                )
            )

            else -> mapOf(
                "unknown" to mapOf(
                    "contentTypeId" to type.id
                )
            )
        }
    }
}
