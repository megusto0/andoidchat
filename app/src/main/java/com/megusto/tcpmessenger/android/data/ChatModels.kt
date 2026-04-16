package com.megusto.tcpmessenger.android.data

import java.util.Locale
import java.util.UUID

enum class MessageType {
    OWN,
    OTHER,
    INFO,
    ERROR,
}

data class MessageItem(
    val id: String = UUID.randomUUID().toString(),
    val type: MessageType,
    val sender: String,
    val text: String,
    val timestampMillis: Long = System.currentTimeMillis(),
)

enum class ChatContextKind {
    GENERAL,
    SELF,
    GROUP,
}

data class ChatContext(
    val id: String,
    val kind: ChatContextKind,
    val title: String,
    val participants: List<String>,
    val messages: List<MessageItem> = emptyList(),
    val hasUnread: Boolean = false,
    val lastActivityAt: Long = System.currentTimeMillis(),
)

data class PendingOwnMessage(
    val chatId: String,
    val text: String,
)

enum class GroupMode {
    ALL,
    NONE,
    CUSTOM;

    fun toProtocolValue(): String = name.lowercase(Locale.ROOT)

    companion object {
        fun fromProtocolValue(raw: String?): GroupMode = when (raw?.lowercase(Locale.ROOT)) {
            "all" -> ALL
            "none" -> NONE
            else -> CUSTOM
        }
    }
}

enum class ClientPlatform {
    DESKTOP,
    ANDROID,
    UNKNOWN;

    fun toProtocolValue(): String = when (this) {
        DESKTOP -> "desktop"
        ANDROID -> "android"
        UNKNOWN -> "unknown"
    }

    companion object {
        fun fromProtocolValue(raw: String?): ClientPlatform = when (raw?.lowercase(Locale.ROOT)) {
            "desktop" -> DESKTOP
            "android" -> ANDROID
            else -> UNKNOWN
        }
    }
}

enum class ConnectionStatus {
    DISCONNECTED,
    CONNECTING,
    CONNECTED,
}

enum class Screen {
    LOGIN,
    CHAT,
}

data class ChatState(
    val screen: Screen = Screen.LOGIN,
    val connectionStatus: ConnectionStatus = ConnectionStatus.DISCONNECTED,
    val userName: String = "",
    val chats: Map<String, ChatContext> = emptyMap(),
    val chatOrder: List<String> = emptyList(),
    val activeChatId: String? = null,
    val clients: List<String> = emptyList(),
    val clientPlatforms: Map<String, ClientPlatform> = emptyMap(),
    val pendingOwnMessages: List<PendingOwnMessage> = emptyList(),
    val groupMode: GroupMode = GroupMode.ALL,
    val selectedClients: Set<String> = emptySet(),
    val error: String? = null,
)

sealed interface ChatAction {
    data class Connect(
        val host: String,
        val port: String,
        val name: String,
    ) : ChatAction

    data class Connected(
        val name: String,
    ) : ChatAction

    data object Disconnected : ChatAction

    data class MessageReceived(
        val sender: String,
        val text: String,
        val mode: GroupMode,
        val targets: List<String>,
    ) : ChatAction

    data class ClientsUpdated(
        val clients: List<String>,
    ) : ChatAction

    data class ClientPlatformsUpdated(
        val platforms: Map<String, ClientPlatform>,
    ) : ChatAction

    data class InfoReceived(
        val text: String,
    ) : ChatAction

    data class ErrorReceived(
        val text: String,
    ) : ChatAction

    data class SendMessage(
        val text: String,
        val mode: GroupMode,
        val targets: List<String>,
    ) : ChatAction

    data class SetGroup(
        val mode: GroupMode,
        val selected: Set<String>,
    ) : ChatAction

    data class SwitchChat(
        val chatId: String,
    ) : ChatAction

    data class SetError(
        val error: String,
    ) : ChatAction
}

sealed interface ServerEvent {
    data class LoginOk(val name: String) : ServerEvent
    data class Info(val text: String) : ServerEvent
    data class Error(val text: String) : ServerEvent
    data class Message(
        val sender: String,
        val text: String,
        val mode: GroupMode,
        val targets: List<String>,
    ) : ServerEvent

    data class Clients(val names: List<String>) : ServerEvent
    data class ClientPlatforms(val platforms: Map<String, ClientPlatform>) : ServerEvent
    data object Disconnected : ServerEvent
}
