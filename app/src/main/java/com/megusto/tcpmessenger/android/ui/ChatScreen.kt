package com.megusto.tcpmessenger.android.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.automirrored.rounded.ExitToApp
import androidx.compose.material.icons.automirrored.rounded.Send
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Menu
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberDrawerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.megusto.tcpmessenger.android.data.ChatContext
import com.megusto.tcpmessenger.android.data.ChatContextKind
import com.megusto.tcpmessenger.android.data.ChatState
import com.megusto.tcpmessenger.android.data.ConnectionStatus
import com.megusto.tcpmessenger.android.data.GroupMode
import com.megusto.tcpmessenger.android.data.MessageItem
import com.megusto.tcpmessenger.android.data.MessageType
import com.megusto.tcpmessenger.android.ui.theme.Accent
import com.megusto.tcpmessenger.android.ui.theme.AccentMuted
import com.megusto.tcpmessenger.android.ui.theme.AppBackground
import com.megusto.tcpmessenger.android.ui.theme.BorderSoft
import com.megusto.tcpmessenger.android.ui.theme.BorderStrong
import com.megusto.tcpmessenger.android.ui.theme.ElevatedCard
import com.megusto.tcpmessenger.android.ui.theme.ErrorRed
import com.megusto.tcpmessenger.android.ui.theme.InfoBlue
import com.megusto.tcpmessenger.android.ui.theme.InputSurface
import com.megusto.tcpmessenger.android.ui.theme.MainSurface
import com.megusto.tcpmessenger.android.ui.theme.MessageSurface
import com.megusto.tcpmessenger.android.ui.theme.SidebarSurface
import com.megusto.tcpmessenger.android.ui.theme.Success
import com.megusto.tcpmessenger.android.ui.theme.TextMuted
import com.megusto.tcpmessenger.android.ui.theme.TextPrimary
import com.megusto.tcpmessenger.android.ui.theme.TextSecondary
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class, androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
fun ChatScreen(
    state: ChatState,
    onSendMessage: (String) -> Unit,
    onRefreshClients: () -> Unit,
    onDisconnect: () -> Unit,
    onSwitchChat: (String) -> Unit,
    onSelectAllRecipients: () -> Unit,
    onSelectNoRecipients: () -> Unit,
    onActivateSelectedRecipientsMode: () -> Unit,
    onToggleRecipient: (String) -> Unit,
) {
    val drawerState = rememberDrawerState(initialValue = androidx.compose.material3.DrawerValue.Closed)
    val scope = rememberCoroutineScope()
    val lifecycleOwner = LocalLifecycleOwner.current
    var search by rememberSaveable { mutableStateOf("") }
    var draft by rememberSaveable { mutableStateOf("") }

    val visibleChats = remember(state.chats, state.chatOrder) {
        state.chatOrder.take(10).mapNotNull { state.chats[it] }
    }
    val activeChat = visibleChats.firstOrNull { it.id == state.activeChatId } ?: visibleChats.firstOrNull()
    val canSendToCurrentTarget = state.groupMode != GroupMode.CUSTOM || state.selectedClients.isNotEmpty()

    DisposableEffect(lifecycleOwner, state.connectionStatus) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_START && state.connectionStatus == ConnectionStatus.CONNECTED) {
                onRefreshClients()
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
        }
    }

    ModalNavigationDrawer(
        drawerState = drawerState,
        drawerContent = {
            ModalDrawerSheet(
                modifier = Modifier.fillMaxWidth(0.88f),
                drawerContainerColor = SidebarSurface,
                drawerContentColor = TextPrimary,
                windowInsets = WindowInsets.safeDrawing,
            ) {
                RecipientDrawer(
                    userName = state.userName,
                    clients = state.clients,
                    groupMode = state.groupMode,
                    selectedClients = state.selectedClients,
                    search = search,
                    onSearchChange = { search = it },
                    onSelectAllRecipients = onSelectAllRecipients,
                    onSelectNoRecipients = onSelectNoRecipients,
                    onActivateSelectedRecipientsMode = onActivateSelectedRecipientsMode,
                    onToggleRecipient = onToggleRecipient,
                )
            }
        },
    ) {
        Scaffold(
            containerColor = AppBackground,
            contentWindowInsets = WindowInsets.statusBars,
            topBar = {
                CenterAlignedTopAppBar(
                    colors = TopAppBarDefaults.centerAlignedTopAppBarColors(
                        containerColor = MainSurface,
                        titleContentColor = TextPrimary,
                    ),
                    navigationIcon = {
                        IconButton(onClick = { scope.launch { drawerState.open() } }) {
                            Icon(
                                imageVector = Icons.Rounded.Menu,
                                contentDescription = "Открыть список клиентов",
                                tint = TextPrimary,
                            )
                        }
                    },
                    title = {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text(
                                text = "TCP Messenger",
                                fontSize = 18.sp,
                                fontWeight = FontWeight.SemiBold,
                            )
                            Text(
                                text = when (state.connectionStatus) {
                                    ConnectionStatus.CONNECTING -> "Подключение..."
                                    ConnectionStatus.CONNECTED -> "В сети"
                                    ConnectionStatus.DISCONNECTED -> "Отключено"
                                },
                                fontSize = 12.sp,
                                color = if (state.connectionStatus == ConnectionStatus.CONNECTED) {
                                    Success
                                } else {
                                    TextMuted
                                },
                            )
                        }
                    },
                    actions = {
                        IconButton(onClick = onDisconnect) {
                            Icon(
                                imageVector = Icons.AutoMirrored.Rounded.ExitToApp,
                                contentDescription = "Отключиться",
                                tint = TextPrimary,
                            )
                        }
                    },
                )
            },
        ) { innerPadding ->
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding)
                    .background(AppBackground),
            ) {
                MessageList(
                    modifier = Modifier.weight(1f),
                    chat = activeChat,
                )

                ComposerArea(
                    chats = visibleChats,
                    activeChatId = activeChat?.id,
                    draft = draft,
                    canSend = canSendToCurrentTarget,
                    onDraftChange = { draft = it },
                    onSwitchChat = onSwitchChat,
                    onSend = {
                        onSendMessage(draft)
                        draft = ""
                    },
                )
            }
        }
    }
}

@Composable
private fun RecipientDrawer(
    userName: String,
    clients: List<String>,
    groupMode: GroupMode,
    selectedClients: Set<String>,
    search: String,
    onSearchChange: (String) -> Unit,
    onSelectAllRecipients: () -> Unit,
    onSelectNoRecipients: () -> Unit,
    onActivateSelectedRecipientsMode: () -> Unit,
    onToggleRecipient: (String) -> Unit,
) {
    val orderedClients = remember(clients, userName) {
        clients
            .filter { it != userName }
            .sortedBy { it.lowercase(Locale.getDefault()) }
    }
    val otherClients = orderedClients
    val showSearch = otherClients.size > 10
    val query = search.trim().lowercase(Locale.getDefault())
    val visibleClients = if (query.isBlank()) {
        orderedClients
    } else {
        orderedClients.filter { it.lowercase(Locale.getDefault()).contains(query) }
    }
    val targetHint = when (groupMode) {
        GroupMode.ALL -> "Новые сообщения отправляются всем подключённым клиентам."
        GroupMode.NONE -> "Новые сообщения остаются только в вашем окне."
        GroupMode.CUSTOM -> if (selectedClients.isEmpty()) {
            "Выберите клиентов, которым хотите отправлять новые сообщения."
        } else {
            "Новые сообщения отправляются только: ${selectedClients.sorted().joinToString(", ")}"
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp, vertical = 18.dp),
    ) {
        Surface(
            modifier = Modifier.fillMaxWidth(),
            color = ElevatedCard,
            shape = RoundedCornerShape(24.dp),
            border = BorderStroke(1.dp, BorderSoft),
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(
                    modifier = Modifier
                        .size(48.dp)
                        .clip(CircleShape)
                        .background(Accent.copy(alpha = 0.18f)),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = userName.firstOrNull()?.uppercase() ?: "?",
                        color = TextPrimary,
                        fontWeight = FontWeight.Bold,
                    )
                }
                Spacer(modifier = Modifier.width(12.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = userName,
                        color = TextPrimary,
                        fontSize = 16.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Box(
                            modifier = Modifier
                                .size(8.dp)
                                .clip(CircleShape)
                                .background(Success),
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = "В сети",
                            color = TextSecondary,
                            fontSize = 12.sp,
                        )
                    }
                }
                Surface(
                    shape = RoundedCornerShape(999.dp),
                    color = AccentMuted,
                ) {
                    Text(
                        text = "${clients.size}",
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                        color = TextPrimary,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(18.dp))
        Text(
            text = "Адресаты",
            color = TextSecondary,
            fontSize = 12.sp,
            fontWeight = FontWeight.SemiBold,
        )
        Spacer(modifier = Modifier.height(10.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            RecipientModeButton(
                modifier = Modifier.weight(1f),
                text = "Все",
                active = groupMode == GroupMode.ALL,
                enabled = groupMode != GroupMode.ALL,
                onClick = onSelectAllRecipients,
            )
            RecipientModeButton(
                modifier = Modifier.weight(1f),
                text = "Никто",
                active = groupMode == GroupMode.NONE,
                enabled = groupMode != GroupMode.NONE,
                onClick = onSelectNoRecipients,
            )
            RecipientModeButton(
                modifier = Modifier.weight(1f),
                text = "Группа",
                active = groupMode == GroupMode.CUSTOM,
                enabled = groupMode != GroupMode.CUSTOM && otherClients.isNotEmpty(),
                onClick = onActivateSelectedRecipientsMode,
            )
        }

        Spacer(modifier = Modifier.height(10.dp))
        Text(
            text = targetHint,
            color = TextMuted,
            fontSize = 12.sp,
            lineHeight = 18.sp,
        )

        Spacer(modifier = Modifier.height(18.dp))
        Text(
            text = "Клиенты",
            color = TextSecondary,
            fontSize = 12.sp,
            fontWeight = FontWeight.SemiBold,
        )

        if (showSearch) {
            Spacer(modifier = Modifier.height(12.dp))
            OutlinedTextField(
                modifier = Modifier.fillMaxWidth(),
                value = search,
                onValueChange = onSearchChange,
                singleLine = true,
                shape = RoundedCornerShape(18.dp),
                leadingIcon = {
                    Icon(
                        imageVector = Icons.Rounded.Search,
                        contentDescription = null,
                    )
                },
                placeholder = {
                    Text(
                        text = "Поиск по клиентам",
                        color = TextMuted,
                    )
                },
                colors = drawerFieldColors(),
            )
        }

        Spacer(modifier = Modifier.height(10.dp))
        Text(
            text = if (showSearch && query.isNotBlank()) {
                "Показано ${visibleClients.size} из ${orderedClients.size}"
            } else {
                "Доступно адресатов: ${otherClients.size}"
            },
            color = TextMuted,
            fontSize = 12.sp,
        )

        Spacer(modifier = Modifier.height(12.dp))
        LazyColumn(
            modifier = Modifier.weight(1f),
            contentPadding = PaddingValues(bottom = 16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            if (otherClients.isEmpty()) {
                item {
                    EmptyPill("Другие клиенты появятся здесь после подключения.")
                }
            } else if (visibleClients.isEmpty()) {
                item {
                    EmptyPill("Ничего не найдено")
                }
            } else {
                items(visibleClients, key = { it }) { clientName ->
                    val isSelected = selectedClients.contains(clientName)
                    ClientRow(
                        name = clientName,
                        isSelected = isSelected,
                        onClick = { onToggleRecipient(clientName) },
                    )
                }
            }
        }
    }
}

@Composable
private fun RecipientModeButton(
    text: String,
    active: Boolean,
    enabled: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = if (active) {
        ButtonDefaults.buttonColors(
            containerColor = AccentMuted,
            contentColor = TextPrimary,
            disabledContainerColor = AccentMuted,
            disabledContentColor = TextPrimary,
        )
    } else {
        ButtonDefaults.outlinedButtonColors(
            contentColor = TextSecondary,
        )
    }

    if (active) {
        Button(
            modifier = modifier,
            onClick = onClick,
            enabled = false,
            shape = RoundedCornerShape(16.dp),
            colors = colors,
        ) {
            Text(text = text, fontSize = 12.sp, maxLines = 1)
        }
    } else {
        OutlinedButton(
            modifier = modifier,
            onClick = onClick,
            enabled = enabled,
            shape = RoundedCornerShape(16.dp),
            colors = colors,
            border = BorderStroke(1.dp, BorderSoft),
        ) {
            Text(text = text, fontSize = 12.sp, maxLines = 1)
        }
    }
}

@Composable
private fun ClientRow(
    name: String,
    isSelected: Boolean,
    onClick: () -> Unit,
) {
    val background = if (isSelected) AccentMuted else MainSurface
    val border = when {
        isSelected -> Accent.copy(alpha = 0.45f)
        else -> BorderSoft
    }

    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(20.dp))
            .clickable(onClick = onClick),
        color = background,
        shape = RoundedCornerShape(20.dp),
        border = BorderStroke(1.dp, border),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 14.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier
                    .size(38.dp)
                    .clip(CircleShape)
                    .background(MessageSurface),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = name.firstOrNull()?.uppercase() ?: "?",
                    color = TextPrimary,
                    fontWeight = FontWeight.SemiBold,
                )
            }
            Spacer(modifier = Modifier.width(12.dp))
            Row(
                modifier = Modifier.weight(1f),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = name,
                    color = TextPrimary,
                    fontWeight = FontWeight.Medium,
                    fontSize = 14.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Spacer(modifier = Modifier.width(8.dp))
                Box(
                    modifier = Modifier
                        .size(8.dp)
                        .clip(CircleShape)
                        .background(Success),
                )
            }
        }
    }
}

@Composable
private fun EmptyPill(text: String) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(18.dp),
        color = ElevatedCard,
        border = BorderStroke(1.dp, BorderSoft),
    ) {
        Text(
            text = text,
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 14.dp),
            color = TextMuted,
            fontSize = 12.sp,
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
private fun MessageList(
    modifier: Modifier = Modifier,
    chat: ChatContext?,
) {
    val listState = rememberLazyListState()
    val messages = chat?.messages.orEmpty()

    LaunchedEffect(chat?.id, messages.size) {
        if (messages.isNotEmpty()) {
            listState.animateScrollToItem(messages.lastIndex)
        }
    }

    Box(
        modifier = modifier
            .fillMaxWidth()
            .background(AppBackground),
    ) {
        if (messages.isEmpty()) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(horizontal = 24.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                Text(
                    text = chat?.title ?: "Чат",
                    color = TextPrimary,
                    fontSize = 24.sp,
                    fontWeight = FontWeight.SemiBold,
                )
                Spacer(modifier = Modifier.height(10.dp))
                Text(
                    text = "История сообщений появится здесь после первого сообщения.",
                    color = TextSecondary,
                    fontSize = 14.sp,
                    textAlign = TextAlign.Center,
                    lineHeight = 20.sp,
                )
            }
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                state = listState,
                contentPadding = PaddingValues(horizontal = 14.dp, vertical = 18.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                items(messages, key = { it.id }) { message ->
                    MessageBubble(message = message)
                }
            }
        }
    }
}

@Composable
private fun MessageBubble(message: MessageItem) {
    val timeFormatter = remember { SimpleDateFormat("HH:mm", Locale.getDefault()) }
    val timeLabel = remember(message.timestampMillis) {
        timeFormatter.format(Date(message.timestampMillis))
    }

    when (message.type) {
        MessageType.INFO -> {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.Center,
            ) {
                SystemBadge(
                    text = message.text,
                    background = InfoBlue.copy(alpha = 0.14f),
                    border = InfoBlue.copy(alpha = 0.26f),
                    contentColor = InfoBlue,
                )
            }
        }

        MessageType.ERROR -> {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.Center,
            ) {
                SystemBadge(
                    text = message.text,
                    background = ErrorRed.copy(alpha = 0.12f),
                    border = ErrorRed.copy(alpha = 0.24f),
                    contentColor = ErrorRed,
                )
            }
        }

        MessageType.OWN -> {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.End,
            ) {
                Surface(
                    modifier = Modifier.widthIn(max = 340.dp),
                    shape = RoundedCornerShape(22.dp),
                    color = Accent,
                ) {
                    Column(
                        modifier = Modifier.padding(horizontal = 18.dp, vertical = 14.dp),
                    ) {
                        Text(
                            text = message.text,
                            color = TextPrimary,
                            fontSize = 15.sp,
                            lineHeight = 22.sp,
                        )
                        Spacer(modifier = Modifier.height(10.dp))
                        Text(
                            text = timeLabel,
                            color = TextPrimary.copy(alpha = 0.72f),
                            fontSize = 11.sp,
                            modifier = Modifier.align(Alignment.End),
                        )
                    }
                }
            }
        }

        MessageType.OTHER -> {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.Start,
            ) {
                Row(verticalAlignment = Alignment.Top) {
                    Box(
                        modifier = Modifier
                            .padding(top = 8.dp)
                            .size(34.dp)
                            .clip(CircleShape)
                            .background(ElevatedCard),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            text = message.sender.firstOrNull()?.uppercase() ?: "?",
                            color = TextPrimary,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                    Spacer(modifier = Modifier.width(10.dp))
                    Surface(
                        modifier = Modifier.widthIn(max = 340.dp),
                        shape = RoundedCornerShape(22.dp),
                        color = MessageSurface,
                        border = BorderStroke(1.dp, BorderSoft),
                    ) {
                        Column(
                            modifier = Modifier.padding(horizontal = 18.dp, vertical = 14.dp),
                        ) {
                            Text(
                                text = message.sender,
                                color = TextSecondary,
                                fontSize = 12.sp,
                                fontWeight = FontWeight.SemiBold,
                            )
                            Spacer(modifier = Modifier.height(8.dp))
                            Text(
                                text = message.text,
                                color = TextPrimary,
                                fontSize = 15.sp,
                                lineHeight = 22.sp,
                            )
                            Spacer(modifier = Modifier.height(10.dp))
                            Text(
                                text = timeLabel,
                                color = TextMuted,
                                fontSize = 11.sp,
                                modifier = Modifier.align(Alignment.End),
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SystemBadge(
    text: String,
    background: androidx.compose.ui.graphics.Color,
    border: androidx.compose.ui.graphics.Color,
    contentColor: androidx.compose.ui.graphics.Color,
) {
    Surface(
        shape = RoundedCornerShape(999.dp),
        color = background,
        border = BorderStroke(1.dp, border),
    ) {
        Text(
            text = text,
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
            color = contentColor,
            fontSize = 12.sp,
            textAlign = TextAlign.Center,
        )
    }
}

@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
private fun ComposerArea(
    chats: List<ChatContext>,
    activeChatId: String?,
    draft: String,
    canSend: Boolean,
    onDraftChange: (String) -> Unit,
    onSwitchChat: (String) -> Unit,
    onSend: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(MainSurface)
            .padding(start = 14.dp, end = 14.dp, top = 12.dp, bottom = 12.dp),
    ) {
        FlowRow(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
            maxItemsInEachRow = 5,
        ) {
            if (chats.isEmpty()) {
                ChatChip(
                    title = "Current chat",
                    active = true,
                    hasUnread = false,
                    onClick = {},
                )
            } else {
                chats.forEach { chat ->
                    ChatChip(
                        title = chat.title,
                        active = chat.id == activeChatId,
                        hasUnread = chat.hasUnread,
                        onClick = { onSwitchChat(chat.id) },
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(12.dp))
        Surface(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(22.dp),
            color = InputSurface,
            border = BorderStroke(1.dp, BorderStrong),
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 14.dp, vertical = 10.dp),
                verticalAlignment = Alignment.Bottom,
            ) {
                OutlinedTextField(
                    modifier = Modifier.weight(1f),
                    value = draft,
                    onValueChange = onDraftChange,
                    minLines = 1,
                    maxLines = 5,
                    placeholder = {
                        Text(
                            text = if (canSend) "Введите сообщение..." else "Выберите адресатов...",
                            color = TextMuted,
                        )
                    },
                    enabled = canSend,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Text),
                    colors = composerFieldColors(),
                    shape = RoundedCornerShape(18.dp),
                )
                Spacer(modifier = Modifier.width(8.dp))
                Button(
                    onClick = onSend,
                    enabled = draft.trim().isNotEmpty() && canSend,
                    shape = RoundedCornerShape(18.dp),
                    contentPadding = PaddingValues(horizontal = 14.dp, vertical = 14.dp),
                ) {
                    Icon(
                        imageVector = Icons.AutoMirrored.Rounded.Send,
                        contentDescription = "Отправить сообщение",
                        modifier = Modifier.size(18.dp),
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = "Enter на Android заменяется кнопкой отправки. Чат-пузырьки выше переключают контекст истории.",
            color = TextMuted,
            fontSize = 11.sp,
            lineHeight = 16.sp,
            modifier = Modifier.padding(horizontal = 4.dp),
        )
    }
}

@Composable
private fun ChatChip(
    title: String,
    active: Boolean,
    hasUnread: Boolean,
    onClick: () -> Unit,
) {
    Surface(
        modifier = Modifier
            .heightIn(min = 32.dp)
            .clip(RoundedCornerShape(999.dp))
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(999.dp),
        color = if (active) AccentMuted else ElevatedCard,
        border = BorderStroke(1.dp, if (active) Accent.copy(alpha = 0.42f) else BorderSoft),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = title,
                color = if (active) TextPrimary else TextSecondary,
                fontSize = 12.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (hasUnread) {
                Spacer(modifier = Modifier.width(8.dp))
                Box(
                    modifier = Modifier
                        .size(8.dp)
                        .clip(CircleShape)
                        .background(ErrorRed),
                )
            }
        }
    }
}

@Composable
private fun drawerFieldColors() = OutlinedTextFieldDefaults.colors(
    focusedContainerColor = MainSurface,
    unfocusedContainerColor = MainSurface,
    focusedTextColor = TextPrimary,
    unfocusedTextColor = TextPrimary,
    focusedBorderColor = Accent,
    unfocusedBorderColor = BorderSoft,
    cursorColor = Accent,
    focusedPlaceholderColor = TextMuted,
    unfocusedPlaceholderColor = TextMuted,
)

@Composable
private fun composerFieldColors() = OutlinedTextFieldDefaults.colors(
    focusedContainerColor = InputSurface,
    unfocusedContainerColor = InputSurface,
    disabledContainerColor = InputSurface,
    focusedTextColor = TextPrimary,
    unfocusedTextColor = TextPrimary,
    disabledTextColor = TextMuted,
    focusedBorderColor = BorderSoft,
    unfocusedBorderColor = BorderSoft,
    disabledBorderColor = BorderSoft,
    cursorColor = Accent,
)
