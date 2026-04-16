package com.megusto.tcpmessenger.android.ui

import androidx.compose.runtime.Composable
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.megusto.tcpmessenger.android.data.Screen

@Composable
fun MessengerApp(
    viewModel: MessengerViewModel = viewModel(),
) {
    val state = viewModel.state.collectAsStateWithLifecycle()

    when (state.value.screen) {
        Screen.LOGIN -> LoginScreen(
            status = state.value.connectionStatus,
            error = state.value.error,
            onConnect = viewModel::connect,
            onDiscoverServer = viewModel::discoverServer,
        )

        Screen.CHAT -> ChatScreen(
            state = state.value,
            onSendMessage = viewModel::sendMessage,
            onRefreshClients = viewModel::refreshClients,
            onDisconnect = viewModel::disconnect,
            onSwitchChat = viewModel::switchChat,
            onSelectAllRecipients = viewModel::selectAllRecipients,
            onSelectNoRecipients = viewModel::selectNoRecipients,
            onActivateSelectedRecipientsMode = viewModel::activateSelectedRecipientsMode,
            onToggleRecipient = viewModel::toggleRecipient,
        )
    }
}
