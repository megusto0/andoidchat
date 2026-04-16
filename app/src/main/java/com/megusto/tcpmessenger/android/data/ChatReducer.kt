package com.megusto.tcpmessenger.android.data

import java.text.Collator
import java.util.Locale
import java.util.UUID

object ChatReducer {
    const val GENERAL_CHAT_ID = "chat:general"
    const val SELF_CHAT_ID = "chat:self"

    private val collator: Collator = Collator.getInstance(Locale("ru"))

    private data class ChatDescriptor(
        val id: String,
        val kind: ChatContextKind,
        val participants: List<String>,
        val title: String,
    )

    private data class ChatUpdate(
        val chats: Map<String, ChatContext>,
        val chatOrder: List<String>,
        val activeChatId: String? = null,
    )

    val initialState = ChatState()

    fun reduce(state: ChatState, action: ChatAction): ChatState {
        return when (action) {
        is ChatAction.Connect -> state.copy(
            connectionStatus = ConnectionStatus.CONNECTING,
            error = null,
            userName = action.name,
        )

        is ChatAction.Connected -> {
            val generalDescriptor = makeChatDescriptor(ChatContextKind.GENERAL, emptyList())
            val connectionMessage = makeMessage(
                type = MessageType.INFO,
                sender = "Сервер",
                text = "Подключение установлено",
            )
            val chatUpdate = appendMessageToChat(
                state = state.copy(
                    chats = emptyMap(),
                    chatOrder = emptyList(),
                    activeChatId = GENERAL_CHAT_ID,
                    pendingOwnMessages = emptyList(),
                ),
                descriptor = generalDescriptor,
                message = connectionMessage,
                activate = true,
            )

            state.copy(
                screen = Screen.CHAT,
                connectionStatus = ConnectionStatus.CONNECTED,
                userName = action.name,
                error = null,
                chats = chatUpdate.chats,
                chatOrder = chatUpdate.chatOrder,
                activeChatId = GENERAL_CHAT_ID,
                clients = if (state.clients.isEmpty()) listOf(action.name) else state.clients,
                pendingOwnMessages = emptyList(),
                groupMode = GroupMode.ALL,
                selectedClients = emptySet(),
            )
        }

        ChatAction.Disconnected -> initialState

        is ChatAction.MessageReceived -> {
            val descriptor = getDescriptorFromIncoming(
                currentUser = state.userName,
                sender = action.sender,
                mode = action.mode,
                targets = action.targets,
            )

            if (action.sender == state.userName) {
                val pendingIndex = state.pendingOwnMessages.indexOfFirst { pending ->
                    pending.chatId == descriptor.id && pending.text == action.text
                }
                if (pendingIndex != -1) {
                    return state.copy(
                        pendingOwnMessages = state.pendingOwnMessages.filterIndexed { index, _ ->
                            index != pendingIndex
                        },
                    )
                }
            }

            val chatUpdate = appendMessageToChat(
                state = state,
                descriptor = descriptor,
                message = makeMessage(
                    type = if (action.sender == state.userName) MessageType.OWN else MessageType.OTHER,
                    sender = action.sender,
                    text = action.text,
                ),
                markUnread = state.activeChatId != descriptor.id,
            )

            state.copy(
                chats = chatUpdate.chats,
                chatOrder = chatUpdate.chatOrder,
            )
        }

        is ChatAction.ClientsUpdated -> {
            val uniqueClients = action.clients.distinct()
            val nextClients = if (state.userName.isNotBlank()) {
                listOf(state.userName) + uniqueClients.filter { it != state.userName }
            } else {
                uniqueClients
            }
            val previousClients = state.clients.toSet()
            val nextClientSet = nextClients.toSet()
            val joined = nextClients.filter { client ->
                client != state.userName && client !in previousClients
            }
            val left = state.clients.filter { client ->
                client != state.userName && client !in nextClientSet
            }

            var nextState = state.copy(clients = nextClients)

            joined.forEach { name ->
                val descriptor = makeChatDescriptor(ChatContextKind.GENERAL, emptyList())
                val update = appendMessageToChat(
                    state = nextState,
                    descriptor = descriptor,
                    message = makeMessage(MessageType.INFO, "Сервер", "$name присоединился"),
                    markUnread = nextState.activeChatId != descriptor.id,
                )
                nextState = nextState.copy(
                    chats = update.chats,
                    chatOrder = update.chatOrder,
                )
            }

            left.forEach { name ->
                val descriptor = makeChatDescriptor(ChatContextKind.GENERAL, emptyList())
                val update = appendMessageToChat(
                    state = nextState,
                    descriptor = descriptor,
                    message = makeMessage(MessageType.INFO, "Сервер", "$name отключился"),
                    markUnread = nextState.activeChatId != descriptor.id,
                )
                nextState = nextState.copy(
                    chats = update.chats,
                    chatOrder = update.chatOrder,
                )
            }

            val nextSelectedClients = when (nextState.groupMode) {
                GroupMode.ALL -> nextClients.filter { it != nextState.userName }.toSet()
                GroupMode.NONE -> emptySet()
                GroupMode.CUSTOM -> nextState.selectedClients.filter { name ->
                    name != nextState.userName && name in nextClientSet
                }.toSet()
            }

            nextState.copy(selectedClients = nextSelectedClients)
        }

        is ChatAction.InfoReceived -> {
            val descriptor = makeChatDescriptor(ChatContextKind.GENERAL, emptyList())
            val update = appendMessageToChat(
                state = state,
                descriptor = descriptor,
                message = makeMessage(MessageType.INFO, "Сервер", action.text),
                markUnread = state.activeChatId != descriptor.id,
            )
            state.copy(
                chats = update.chats,
                chatOrder = update.chatOrder,
            )
        }

        is ChatAction.ErrorReceived -> {
            if (state.screen == Screen.LOGIN) {
                return state.copy(
                    connectionStatus = ConnectionStatus.DISCONNECTED,
                    error = action.text,
                )
            }

            val activeChat = state.activeChatId?.let(state.chats::get)
            if (activeChat != null) {
                val descriptor = makeChatDescriptor(activeChat.kind, activeChat.participants)
                val update = appendMessageToChat(
                    state = state,
                    descriptor = descriptor,
                    message = makeMessage(MessageType.ERROR, "Ошибка", action.text),
                    activate = true,
                )
                return state.copy(
                    chats = update.chats,
                    chatOrder = update.chatOrder,
                )
            }

            state.copy(error = action.text)
        }

        is ChatAction.SendMessage -> {
            val descriptor = getDescriptorFromOutgoing(
                mode = action.mode,
                targets = action.targets,
            )
            val update = appendMessageToChat(
                state = state,
                descriptor = descriptor,
                message = makeMessage(MessageType.OWN, state.userName, action.text),
                activate = true,
            )

            state.copy(
                chats = update.chats,
                chatOrder = update.chatOrder,
                activeChatId = descriptor.id,
                pendingOwnMessages = state.pendingOwnMessages + PendingOwnMessage(
                    chatId = descriptor.id,
                    text = action.text,
                ),
                groupMode = action.mode,
                selectedClients = if (action.mode == GroupMode.ALL) {
                    state.clients.filter { it != state.userName }.toSet()
                } else {
                    action.targets.toSet()
                },
            )
        }

        is ChatAction.SetGroup -> {
            if (state.groupMode == action.mode && setsEqual(state.selectedClients, action.selected)) {
                state
            } else {
                state.copy(
                    groupMode = action.mode,
                    selectedClients = action.selected,
                )
            }
        }

        is ChatAction.SwitchChat -> {
            val chat = state.chats[action.chatId] ?: return state
            val update = upsertChat(
                state = state,
                descriptor = makeChatDescriptor(chat.kind, chat.participants),
                activate = true,
                clearUnread = true,
            )
            state.copy(
                chats = update.chats,
                chatOrder = update.chatOrder,
                activeChatId = action.chatId,
                groupMode = getGroupModeForChat(chat),
                selectedClients = getSelectedClientsForChat(state, chat),
            )
        }

        is ChatAction.SetError -> state.copy(
            error = action.error,
            connectionStatus = ConnectionStatus.DISCONNECTED,
        )
        }
    }

    private fun makeMessage(
        type: MessageType,
        sender: String,
        text: String,
    ): MessageItem = MessageItem(
        id = UUID.randomUUID().toString(),
        type = type,
        sender = sender,
        text = text,
    )

    private fun setsEqual(a: Set<String>, b: Set<String>): Boolean {
        if (a.size != b.size) return false
        return a.all(b::contains)
    }

    private fun sortNames(names: Iterable<String>): List<String> =
        names.toSet().sortedWith(java.util.Comparator { left, right -> collator.compare(left, right) })

    private fun makeChatTitle(
        kind: ChatContextKind,
        participants: List<String>,
    ): String = when (kind) {
        ChatContextKind.GENERAL -> "General"
        ChatContextKind.SELF -> "Self"
        ChatContextKind.GROUP -> {
            if (participants.size <= 2) {
                participants.joinToString(", ")
            } else {
                "${participants[0]}, ${participants[1]} + ${participants.size - 2}"
            }
        }
    }

    private fun makeChatDescriptor(
        kind: ChatContextKind,
        rawParticipants: Iterable<String>,
    ): ChatDescriptor {
        val participants = sortNames(rawParticipants)

        return when (kind) {
            ChatContextKind.GENERAL -> ChatDescriptor(
                id = GENERAL_CHAT_ID,
                kind = kind,
                participants = emptyList(),
                title = makeChatTitle(kind, emptyList()),
            )

            ChatContextKind.SELF -> ChatDescriptor(
                id = SELF_CHAT_ID,
                kind = kind,
                participants = emptyList(),
                title = makeChatTitle(kind, emptyList()),
            )

            ChatContextKind.GROUP -> ChatDescriptor(
                id = "chat:group:${participants.joinToString("|")}",
                kind = kind,
                participants = participants,
                title = makeChatTitle(kind, participants),
            )
        }
    }

    private fun getDescriptorFromOutgoing(
        mode: GroupMode,
        targets: List<String>,
    ): ChatDescriptor = when {
        mode == GroupMode.ALL -> makeChatDescriptor(ChatContextKind.GENERAL, emptyList())
        mode == GroupMode.NONE || targets.isEmpty() -> makeChatDescriptor(ChatContextKind.SELF, emptyList())
        else -> makeChatDescriptor(ChatContextKind.GROUP, targets)
    }

    private fun getDescriptorFromIncoming(
        currentUser: String,
        sender: String,
        mode: GroupMode,
        targets: List<String>,
    ): ChatDescriptor {
        if (mode == GroupMode.ALL) {
            return makeChatDescriptor(ChatContextKind.GENERAL, emptyList())
        }

        if (mode == GroupMode.NONE) {
            return makeChatDescriptor(ChatContextKind.SELF, emptyList())
        }

        val participants = (listOf(sender) + targets)
            .filter { it != currentUser }
            .toSet()

        return if (participants.isEmpty()) {
            makeChatDescriptor(ChatContextKind.SELF, emptyList())
        } else {
            makeChatDescriptor(ChatContextKind.GROUP, participants)
        }
    }

    private fun ensureChat(
        chats: Map<String, ChatContext>,
        descriptor: ChatDescriptor,
    ): ChatContext {
        val existing = chats[descriptor.id]
        return if (existing != null) {
            existing.copy(
                kind = descriptor.kind,
                participants = descriptor.participants,
                title = descriptor.title,
            )
        } else {
            ChatContext(
                id = descriptor.id,
                kind = descriptor.kind,
                title = descriptor.title,
                participants = descriptor.participants,
                messages = emptyList(),
                hasUnread = false,
                lastActivityAt = System.currentTimeMillis(),
            )
        }
    }

    private fun sortChatOrder(chats: Map<String, ChatContext>): List<String> =
        chats.values
            .sortedByDescending { it.lastActivityAt }
            .map { it.id }

    private fun appendMessageToChat(
        state: ChatState,
        descriptor: ChatDescriptor,
        message: MessageItem,
        activate: Boolean = false,
        markUnread: Boolean = false,
    ): ChatUpdate {
        val current = ensureChat(state.chats, descriptor)
        val updatedChat = current.copy(
            messages = current.messages + message,
            hasUnread = if (activate) {
                false
            } else {
                current.hasUnread || markUnread
            },
            lastActivityAt = System.currentTimeMillis(),
        )

        val chats = state.chats + (descriptor.id to updatedChat)
        return ChatUpdate(
            chats = chats,
            chatOrder = sortChatOrder(chats),
            activeChatId = if (activate) descriptor.id else state.activeChatId,
        )
    }

    private fun upsertChat(
        state: ChatState,
        descriptor: ChatDescriptor,
        activate: Boolean = false,
        clearUnread: Boolean = false,
    ): ChatUpdate {
        val current = ensureChat(state.chats, descriptor)
        val updatedChat = current.copy(
            hasUnread = if (clearUnread) false else current.hasUnread,
        )
        val chats = state.chats + (descriptor.id to updatedChat)
        return ChatUpdate(
            chats = chats,
            chatOrder = sortChatOrder(chats),
            activeChatId = if (activate) descriptor.id else state.activeChatId,
        )
    }

    private fun getSelectedClientsForChat(
        state: ChatState,
        chat: ChatContext,
    ): Set<String> {
        val availableRecipients = state.clients.filter { it != state.userName }.toSet()
        return when (chat.kind) {
            ChatContextKind.GENERAL -> availableRecipients
            ChatContextKind.SELF -> emptySet()
            ChatContextKind.GROUP -> chat.participants.filter { it in availableRecipients }.toSet()
        }
    }

    private fun getGroupModeForChat(chat: ChatContext): GroupMode = when (chat.kind) {
        ChatContextKind.GENERAL -> GroupMode.ALL
        ChatContextKind.SELF -> GroupMode.NONE
        ChatContextKind.GROUP -> GroupMode.CUSTOM
    }
}
