package com.megusto.tcpmessenger.android.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.megusto.tcpmessenger.android.data.ChatAction
import com.megusto.tcpmessenger.android.data.ChatReducer
import com.megusto.tcpmessenger.android.data.ChatState
import com.megusto.tcpmessenger.android.data.GroupMode
import com.megusto.tcpmessenger.android.data.ServerEvent
import com.megusto.tcpmessenger.android.data.TcpMessengerClient
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.text.Collator
import java.util.Locale

class MessengerViewModel : ViewModel() {
    private val client = TcpMessengerClient(viewModelScope)
    private val collator = Collator.getInstance(Locale("ru"))

    private val _state = MutableStateFlow(ChatReducer.initialState)
    val state: StateFlow<ChatState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            client.events.collectLatest(::handleServerEvent)
        }
    }

    fun connect(
        host: String,
        portText: String,
        name: String,
    ) {
        val cleanHost = host.trim()
        val cleanName = name.trim()
        val port = portText.trim().toIntOrNull()

        if (cleanHost.isEmpty()) {
            dispatch(ChatAction.SetError("Укажите IP-адрес сервера."))
            return
        }
        if (port == null || port !in 1..65_535) {
            dispatch(ChatAction.SetError("Укажите корректный порт."))
            return
        }
        if (cleanName.isEmpty()) {
            dispatch(ChatAction.SetError("Укажите имя пользователя."))
            return
        }

        dispatch(ChatAction.Connect(cleanHost, portText, cleanName))
        viewModelScope.launch {
            runCatching { client.connect(cleanHost, port, cleanName) }
                .onSuccess {
                    dispatch(ChatAction.Connected(cleanName))
                }
                .onFailure { error ->
                    dispatch(ChatAction.SetError(error.message ?: "Не удалось подключиться."))
                }
        }
    }

    fun sendMessage(text: String) {
        val message = text.trim()
        if (message.isEmpty()) return

        val snapshot = _state.value
        val targets = currentTargets(snapshot)
        if (snapshot.groupMode == GroupMode.CUSTOM && targets.isEmpty()) {
            return
        }

        viewModelScope.launch {
            runCatching { client.sendMessage(message, snapshot.groupMode, targets) }
                .onSuccess {
                    dispatch(ChatAction.SendMessage(message, snapshot.groupMode, targets))
                }
                .onFailure { error ->
                    dispatch(ChatAction.ErrorReceived(error.message ?: "Не удалось отправить сообщение."))
                }
        }
    }

    fun refreshClients() {
        viewModelScope.launch {
            runCatching { client.requestClientList() }
                .onFailure { error ->
                    dispatch(ChatAction.ErrorReceived(error.message ?: "Не удалось запросить список клиентов."))
                }
        }
    }

    fun disconnect() {
        viewModelScope.launch {
            client.disconnect()
            dispatch(ChatAction.Disconnected)
        }
    }

    fun switchChat(chatId: String) {
        dispatch(ChatAction.SwitchChat(chatId))
    }

    fun selectAllRecipients() {
        val snapshot = _state.value
        val otherClients = snapshot.clients.filter { it != snapshot.userName }.toSet()
        dispatch(ChatAction.SetGroup(GroupMode.ALL, otherClients))
    }

    fun selectNoRecipients() {
        dispatch(ChatAction.SetGroup(GroupMode.NONE, emptySet()))
    }

    fun activateSelectedRecipientsMode() {
        val snapshot = _state.value
        val available = snapshot.clients.filter { it != snapshot.userName }.toSet()
        if (available.isEmpty()) return
        val kept = snapshot.selectedClients.filter { it in available }.toSet()
        dispatch(ChatAction.SetGroup(GroupMode.CUSTOM, kept))
    }

    fun toggleRecipient(name: String) {
        val snapshot = _state.value
        if (name == snapshot.userName) return

        val nextSelection = if (snapshot.groupMode == GroupMode.ALL) {
            snapshot.clients.filter { it != snapshot.userName }.toMutableSet()
        } else {
            snapshot.selectedClients.toMutableSet()
        }

        if (!nextSelection.add(name)) {
            nextSelection.remove(name)
        }

        val nextMode = if (nextSelection.isEmpty()) GroupMode.NONE else GroupMode.CUSTOM
        dispatch(ChatAction.SetGroup(nextMode, nextSelection))
    }

    override fun onCleared() {
        client.dispose()
        super.onCleared()
    }

    private fun currentTargets(state: ChatState): List<String> = when (state.groupMode) {
        GroupMode.ALL -> state.clients
            .filter { it != state.userName }
            .sortedWith(java.util.Comparator { left, right -> collator.compare(left, right) })

        GroupMode.NONE -> emptyList()
        GroupMode.CUSTOM -> state.selectedClients
            .filter { it != state.userName }
            .sortedWith(java.util.Comparator { left, right -> collator.compare(left, right) })
    }

    private fun handleServerEvent(event: ServerEvent) {
        when (event) {
            is ServerEvent.LoginOk -> dispatch(ChatAction.Connected(event.name))
            is ServerEvent.Info -> dispatch(ChatAction.InfoReceived(event.text))
            is ServerEvent.Error -> dispatch(ChatAction.ErrorReceived(event.text))
            is ServerEvent.Message -> dispatch(
                ChatAction.MessageReceived(
                    sender = event.sender,
                    text = event.text,
                    mode = event.mode,
                    targets = event.targets,
                ),
            )

            is ServerEvent.Clients -> dispatch(ChatAction.ClientsUpdated(event.names))
            is ServerEvent.ClientPlatforms -> dispatch(ChatAction.ClientPlatformsUpdated(event.platforms))
            ServerEvent.Disconnected -> dispatch(ChatAction.Disconnected)
        }
    }

    private fun dispatch(action: ChatAction) {
        _state.update { ChatReducer.reduce(it, action) }
    }
}
