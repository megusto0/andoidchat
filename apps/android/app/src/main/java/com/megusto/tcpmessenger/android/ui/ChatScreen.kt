@file:OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)

package com.megusto.tcpmessenger.android.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ExitToApp
import androidx.compose.material.icons.rounded.ArrowUpward
import androidx.compose.material.icons.rounded.ChatBubbleOutline
import androidx.compose.material.icons.rounded.Info
import androidx.compose.material.icons.rounded.Menu
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material3.DrawerValue
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
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
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Outline
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
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
import com.megusto.tcpmessenger.android.ui.theme.AccentBorder
import com.megusto.tcpmessenger.android.ui.theme.AccentMuted
import com.megusto.tcpmessenger.android.ui.theme.AccentOnBubble
import com.megusto.tcpmessenger.android.ui.theme.ActiveSurface
import com.megusto.tcpmessenger.android.ui.theme.AppBackground
import com.megusto.tcpmessenger.android.ui.theme.BorderSoft
import com.megusto.tcpmessenger.android.ui.theme.DividerSoft
import com.megusto.tcpmessenger.android.ui.theme.ElevatedCard
import com.megusto.tcpmessenger.android.ui.theme.ErrorRed
import com.megusto.tcpmessenger.android.ui.theme.InfoBlue
import com.megusto.tcpmessenger.android.ui.theme.InfoSoft
import com.megusto.tcpmessenger.android.ui.theme.MainSurface
import com.megusto.tcpmessenger.android.ui.theme.Success
import com.megusto.tcpmessenger.android.ui.theme.TextFaint
import com.megusto.tcpmessenger.android.ui.theme.TextMuted
import com.megusto.tcpmessenger.android.ui.theme.TextPrimary
import com.megusto.tcpmessenger.android.ui.theme.TextSecondary
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private val SimulationOutline = Color(0xFF63D6D0)
private val SimulationBotSuffixPattern = Regex("(\\d{3})(?!.*\\d)")

private fun formatSimulationSender(name: String, isSimulation: Boolean): String {
    if (!isSimulation || name == "Server") {
        return name
    }

    val suffix = SimulationBotSuffixPattern.find(name)?.groupValues?.getOrNull(1)
    return if (suffix != null) {
        "bot_$suffix"
    } else {
        name
    }
}

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
    val drawerState = rememberDrawerState(initialValue = DrawerValue.Closed)
    val scope = rememberCoroutineScope()
    val lifecycleOwner = LocalLifecycleOwner.current
    var search by rememberSaveable { mutableStateOf("") }
    var draft by rememberSaveable { mutableStateOf("") }

    val visibleChats = remember(state.chats, state.chatOrder) {
        state.chatOrder.take(10).mapNotNull { state.chats[it] }
    }
    val activeChat = visibleChats.firstOrNull { it.id == state.activeChatId } ?: visibleChats.firstOrNull()
    val canSendToCurrentTarget = state.groupMode != GroupMode.CUSTOM || state.selectedClients.isNotEmpty()
    val onlineCount = state.onlineClients.size

    DisposableEffect(lifecycleOwner, state.connectionStatus) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_START && state.connectionStatus == ConnectionStatus.CONNECTED) {
                onRefreshClients()
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    ModalNavigationDrawer(
        drawerState = drawerState,
        drawerContent = {
            ModalDrawerSheet(
                modifier = Modifier.fillMaxWidth(0.82f),
                drawerContainerColor = MainSurface,
                drawerContentColor = TextPrimary,
                windowInsets = WindowInsets.safeDrawing,
                drawerShape = RoundedCornerShape(0.dp),
            ) {
                RecipientDrawer(
                    userName = state.userName,
                    clients = state.clients,
                    onlineClients = state.onlineClients,
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
                ChatTopBar(
                    status = state.connectionStatus,
                    onlineCount = onlineCount,
                    onMenuClick = { scope.launch { drawerState.open() } },
                    onDisconnect = onDisconnect,
                )
            },
        ) { innerPadding ->
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding)
                    .imePadding()
                    .background(AppBackground),
            ) {
                MessageList(
                    modifier = Modifier.weight(1f),
                    chat = activeChat,
                )

                ComposerArea(
                    chats = visibleChats,
                    activeChat = activeChat,
                    activeChatId = activeChat?.id,
                    draft = draft,
                    canSend = canSendToCurrentTarget,
                    groupMode = state.groupMode,
                    selectedClients = state.selectedClients,
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

// ─────────────────────── Top app bar ───────────────────────

@Composable
private fun ChatTopBar(
    status: ConnectionStatus,
    onlineCount: Int,
    onMenuClick: () -> Unit,
    onDisconnect: () -> Unit,
) {
    TopAppBar(
        modifier = Modifier.drawBehind {
            drawLine(
                color = BorderSoft,
                start = Offset(0f, size.height),
                end = Offset(size.width, size.height),
                strokeWidth = 1.dp.toPx(),
            )
        },
        colors = TopAppBarDefaults.topAppBarColors(
            containerColor = MainSurface,
            titleContentColor = TextPrimary,
        ),
        navigationIcon = {
            IconButton(onClick = onMenuClick) {
                Icon(
                    imageVector = Icons.Rounded.Menu,
                    contentDescription = "Открыть список клиентов",
                    tint = TextPrimary,
                    modifier = Modifier.size(22.dp),
                )
            }
        },
        title = {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Box(
                    modifier = Modifier
                        .size(18.dp)
                        .clip(RoundedCornerShape(5.dp))
                        .background(Accent),
                ) {
                    Icon(
                        imageVector = Icons.Rounded.ChatBubbleOutline,
                        contentDescription = null,
                        tint = MainSurface,
                        modifier = Modifier
                            .align(Alignment.Center)
                            .size(11.dp),
                    )
                }
                Spacer(Modifier.width(10.dp))
                Column {
                    Text(
                        text = "TCP Messenger",
                        style = TextStyle(
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Medium,
                            letterSpacing = (-0.2).sp,
                        ),
                        color = TextSecondary,
                    )
                    Spacer(Modifier.height(1.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        val (statusText, statusColor) = when (status) {
                            ConnectionStatus.CONNECTING -> "Подключение..." to TextMuted
                            ConnectionStatus.CONNECTED -> "В сети" to TextMuted
                            ConnectionStatus.DISCONNECTED -> "Отключено" to TextMuted
                        }
                        if (status == ConnectionStatus.CONNECTED) {
                            Box(
                                modifier = Modifier
                                    .size(5.dp)
                                    .clip(CircleShape)
                                    .background(Success),
                            )
                            Spacer(Modifier.width(6.dp))
                        }
                        Text(
                            text = statusText,
                            style = TextStyle(
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Normal,
                            ),
                            color = statusColor,
                        )
                        if (status == ConnectionStatus.CONNECTED) {
                            Spacer(Modifier.width(5.dp))
                            Text(
                                text = "·",
                                style = TextStyle(fontSize = 11.sp),
                                color = TextMuted,
                            )
                            Spacer(Modifier.width(5.dp))
                            Text(
                                text = "$onlineCount в сети · TCP",
                                style = TextStyle(
                                    fontSize = 11.sp,
                                    fontFamily = FontFamily.Monospace,
                                ),
                                color = TextSecondary,
                            )
                        }
                    }
                }
            }
        },
        actions = {
            IconButton(onClick = onDisconnect) {
                Icon(
                    imageVector = Icons.AutoMirrored.Rounded.ExitToApp,
                    contentDescription = "Отключиться",
                    tint = TextMuted,
                    modifier = Modifier.size(19.dp),
                )
            }
        },
    )
}

// ─────────────────────── Drawer ───────────────────────

@Composable
private fun RecipientDrawer(
    userName: String,
    clients: List<String>,
    onlineClients: Set<String>,
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
    val showSearch = orderedClients.size > 10
    val query = search.trim().lowercase(Locale.getDefault())
    val visibleClients = if (query.isBlank()) {
        orderedClients
    } else {
        orderedClients.filter { it.lowercase(Locale.getDefault()).contains(query) }
    }

    Column(
        modifier = Modifier.fillMaxSize(),
    ) {
        // User header
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .drawBehind {
                    drawLine(
                        color = DividerSoft,
                        start = Offset(0f, size.height),
                        end = Offset(size.width, size.height),
                        strokeWidth = 1.dp.toPx(),
                    )
                }
                .padding(start = 18.dp, end = 18.dp, top = 22.dp, bottom = 16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Avatar(name = userName, size = 42.dp, online = true)
            Spacer(Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = userName.ifBlank { "—" },
                    style = TextStyle(
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Medium,
                        letterSpacing = (-0.1).sp,
                    ),
                    color = TextPrimary,
                )
                Spacer(Modifier.height(1.dp))
                Text(
                    text = "Локальная сеть",
                    style = TextStyle(
                        fontSize = 11.5.sp,
                        fontFamily = FontFamily.Monospace,
                    ),
                    color = TextMuted,
                )
            }
        }

        // Clients section header
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(start = 18.dp, end = 18.dp, top = 18.dp, bottom = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = "КЛИЕНТЫ",
                style = TextStyle(
                    fontSize = 10.5.sp,
                    fontWeight = FontWeight.Medium,
                    letterSpacing = 1.4.sp,
                ),
                color = TextMuted,
                modifier = Modifier.weight(1f),
            )
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(10.dp))
                    .background(ElevatedCard)
                    .padding(horizontal = 7.dp, vertical = 1.dp),
            ) {
                Text(
                    text = orderedClients.size.toString(),
                    style = TextStyle(
                        fontSize = 10.5.sp,
                        fontFamily = FontFamily.Monospace,
                    ),
                    color = TextSecondary,
                )
            }
        }

        if (showSearch) {
            Box(modifier = Modifier.padding(horizontal = 14.dp, vertical = 6.dp)) {
                SearchPill(
                    value = search,
                    onValueChange = onSearchChange,
                )
            }
        }

        // Clients list
        LazyColumn(
            modifier = Modifier.weight(1f),
            contentPadding = PaddingValues(horizontal = 10.dp, vertical = 2.dp),
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            if (orderedClients.isEmpty()) {
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
                    val inGroup = groupMode == GroupMode.CUSTOM && isSelected
                    ClientRow(
                        name = clientName,
                        isOnline = clientName in onlineClients,
                        highlighted = isSelected,
                        inGroup = inGroup,
                        onClick = { onToggleRecipient(clientName) },
                    )
                }
            }
        }

        // Recipients segmented control
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .drawBehind {
                    drawLine(
                        color = DividerSoft,
                        start = Offset(0f, 0f),
                        end = Offset(size.width, 0f),
                        strokeWidth = 1.dp.toPx(),
                    )
                }
                .padding(horizontal = 18.dp, vertical = 16.dp),
        ) {
            Text(
                text = "АДРЕСАТЫ",
                style = TextStyle(
                    fontSize = 10.5.sp,
                    fontWeight = FontWeight.Medium,
                    letterSpacing = 1.4.sp,
                ),
                color = TextMuted,
            )
            Spacer(Modifier.height(10.dp))
            SegmentedRecipients(
                groupMode = groupMode,
                hasClients = orderedClients.isNotEmpty(),
                onAll = onSelectAllRecipients,
                onNone = onSelectNoRecipients,
                onCustom = onActivateSelectedRecipientsMode,
            )
        }
    }
}

@Composable
private fun SegmentedRecipients(
    groupMode: GroupMode,
    hasClients: Boolean,
    onAll: () -> Unit,
    onNone: () -> Unit,
    onCustom: () -> Unit,
) {
    val outerShape = RoundedCornerShape(10.dp)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(outerShape)
            .background(ElevatedCard)
            .border(1.dp, BorderSoft, outerShape)
            .padding(3.dp),
        horizontalArrangement = Arrangement.spacedBy(0.dp),
    ) {
        SegmentedTab(
            label = "Все",
            active = groupMode == GroupMode.ALL,
            enabled = groupMode != GroupMode.ALL,
            onClick = onAll,
            modifier = Modifier.weight(1f),
        )
        SegmentedTab(
            label = "Никто",
            active = groupMode == GroupMode.NONE,
            enabled = groupMode != GroupMode.NONE,
            onClick = onNone,
            modifier = Modifier.weight(1f),
        )
        SegmentedTab(
            label = "Группа",
            active = groupMode == GroupMode.CUSTOM,
            enabled = groupMode != GroupMode.CUSTOM && hasClients,
            onClick = onCustom,
            modifier = Modifier.weight(1f),
        )
    }
}

@Composable
private fun SegmentedTab(
    label: String,
    active: Boolean,
    enabled: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val bg = if (active) ActiveSurface else Color.Transparent
    val textColor = if (active) TextPrimary else TextMuted
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(6.dp))
            .background(bg)
            .clickable(enabled = enabled, onClick = onClick)
            .padding(vertical = 7.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = label,
            style = TextStyle(
                fontSize = 12.sp,
                fontWeight = FontWeight.Medium,
            ),
            color = textColor,
        )
    }
}

@Composable
private fun SearchPill(
    value: String,
    onValueChange: (String) -> Unit,
) {
    val shape = RoundedCornerShape(12.dp)
    var focused by remember { mutableStateOf(false) }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(ElevatedCard)
            .border(1.dp, if (focused) AccentBorder else BorderSoft, shape)
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = Icons.Rounded.Search,
            contentDescription = null,
            tint = TextMuted,
            modifier = Modifier.size(16.dp),
        )
        Spacer(Modifier.width(8.dp))
        Box(modifier = Modifier.weight(1f)) {
            if (value.isEmpty()) {
                Text(
                    text = "Поиск по клиентам",
                    style = TextStyle(fontSize = 13.sp),
                    color = TextMuted,
                )
            }
            BasicTextField(
                value = value,
                onValueChange = onValueChange,
                singleLine = true,
                textStyle = TextStyle(
                    fontSize = 13.sp,
                    color = TextPrimary,
                ),
                cursorBrush = SolidColor(Accent),
                modifier = Modifier
                    .fillMaxWidth()
                    .onFocusChanged { focused = it.isFocused },
            )
        }
    }
}

@Composable
private fun ClientRow(
    name: String,
    isOnline: Boolean,
    highlighted: Boolean,
    inGroup: Boolean,
    onClick: () -> Unit,
) {
    val shape = RoundedCornerShape(10.dp)
    val bg = if (highlighted) AccentMuted else Color.Transparent
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(bg)
            .clickable(onClick = onClick)
            .padding(horizontal = 10.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Avatar(name = name, size = 34.dp, online = isOnline)
        Spacer(Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = name,
                    style = TextStyle(
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Medium,
                    ),
                    color = TextPrimary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                if (inGroup) {
                    Spacer(Modifier.width(8.dp))
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(4.dp))
                            .background(AccentMuted)
                            .padding(horizontal = 6.dp, vertical = 1.dp),
                    ) {
                        Text(
                            text = "ГРУППА",
                            style = TextStyle(
                                fontSize = 9.sp,
                                fontWeight = FontWeight.Medium,
                                letterSpacing = 0.6.sp,
                            ),
                            color = Accent,
                        )
                    }
                }
            }
            Spacer(Modifier.height(1.dp))
            Text(
                text = if (isOnline) "В сети" else "Не в сети",
                style = TextStyle(fontSize = 11.5.sp),
                color = TextMuted,
            )
        }
    }
}

@Composable
private fun Avatar(
    name: String,
    size: androidx.compose.ui.unit.Dp,
    online: Boolean,
) {
    val letter = name.firstOrNull()?.uppercase() ?: "?"
    Box(modifier = Modifier.size(size)) {
        Box(
            modifier = Modifier
                .size(size)
                .clip(CircleShape)
                .background(ElevatedCard),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = letter,
                style = TextStyle(
                    fontSize = (size.value * 0.42f).sp,
                    fontWeight = FontWeight.Medium,
                ),
                color = TextSecondary,
            )
        }
        Box(
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .size((size.value * 0.28f).coerceAtLeast(8f).dp)
                .clip(CircleShape)
                .background(MainSurface)
                .padding(2.dp),
        ) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .clip(CircleShape)
                    .background(if (online) Success else TextFaint),
            )
        }
    }
}

@Composable
private fun EmptyPill(text: String) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(ElevatedCard)
            .padding(horizontal = 14.dp, vertical = 14.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = text,
            style = TextStyle(fontSize = 12.sp),
            color = TextMuted,
            textAlign = TextAlign.Center,
        )
    }
}

// ─────────────────────── Messages ───────────────────────

private fun isGroupable(type: MessageType): Boolean =
    type == MessageType.OWN || type == MessageType.OTHER

@Composable
private fun MessageList(
    modifier: Modifier = Modifier,
    chat: ChatContext?,
) {
    val listState = rememberLazyListState()
    val messages = chat?.messages.orEmpty()
    val regularMessages = remember(messages) { messages.filter { it.simulationId == null } }
    val simulationMessages = remember(messages) { messages.filter { it.simulationId != null } }
    var simulationCollapsed by rememberSaveable(chat?.id) { mutableStateOf(true) }
    val visibleItemCount = regularMessages.size + if (simulationMessages.isNotEmpty()) {
        1 + if (simulationCollapsed) 0 else simulationMessages.size
    } else {
        0
    }

    LaunchedEffect(chat?.id, regularMessages.size, simulationMessages.size, simulationCollapsed) {
        if (visibleItemCount > 0) {
            listState.scrollToItem(visibleItemCount - 1)
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
                    style = TextStyle(
                        fontSize = 22.sp,
                        fontWeight = FontWeight.SemiBold,
                        letterSpacing = (-0.3).sp,
                    ),
                    color = TextPrimary,
                )
                Spacer(Modifier.height(10.dp))
                Text(
                    text = "История сообщений появится здесь после первого сообщения.",
                    style = TextStyle(fontSize = 14.sp, lineHeight = 20.sp),
                    color = TextSecondary,
                    textAlign = TextAlign.Center,
                )
            }
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                state = listState,
                contentPadding = PaddingValues(vertical = 16.dp),
            ) {
                itemsIndexed(regularMessages, key = { _, msg -> msg.id }) { index, message ->
                    val prev = regularMessages.getOrNull(index - 1)
                    val next = regularMessages.getOrNull(index + 1)

                    val isFirstInGroup = !isGroupable(message.type) ||
                        prev == null ||
                        prev.type != message.type ||
                        prev.sender != message.sender
                    val isLastInGroup = !isGroupable(message.type) ||
                        next == null ||
                        next.type != message.type ||
                        next.sender != message.sender

                    val topSpacing = when {
                        index == 0 -> 0.dp
                        isFirstInGroup -> 10.dp
                        else -> 3.dp
                    }
                    if (topSpacing.value > 0f) {
                        Spacer(Modifier.height(topSpacing))
                    }

                    AnimatedVisibility(
                        visible = true,
                        enter = fadeIn(tween(150)) + slideInVertically(
                            initialOffsetY = { it / 4 },
                            animationSpec = tween(200),
                        ),
                    ) {
                        MessageBubble(
                            message = message,
                            isFirstInGroup = isFirstInGroup,
                            isLastInGroup = isLastInGroup,
                        )
                    }
                }

                if (simulationMessages.isNotEmpty()) {
                    item(key = "simulation-feed-header") {
                        Spacer(Modifier.height(if (regularMessages.isEmpty()) 4.dp else 12.dp))
                        SimulationFeedHeader(
                            collapsed = simulationCollapsed,
                            count = simulationMessages.size,
                            latestMessage = simulationMessages.lastOrNull(),
                            onToggle = { simulationCollapsed = !simulationCollapsed },
                        )
                    }

                    if (!simulationCollapsed) {
                        itemsIndexed(simulationMessages, key = { _, msg -> msg.id }) { index, message ->
                            val prev = simulationMessages.getOrNull(index - 1)
                            val next = simulationMessages.getOrNull(index + 1)

                            val isFirstInGroup = !isGroupable(message.type) ||
                                prev == null ||
                                prev.type != message.type ||
                                prev.sender != message.sender
                            val isLastInGroup = !isGroupable(message.type) ||
                                next == null ||
                                next.type != message.type ||
                                next.sender != message.sender

                            val topSpacing = if (index == 0 || isFirstInGroup) 10.dp else 3.dp
                            Spacer(Modifier.height(topSpacing))

                            MessageBubble(
                                message = message,
                                isFirstInGroup = isFirstInGroup,
                                isLastInGroup = isLastInGroup,
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SimulationFeedHeader(
    collapsed: Boolean,
    count: Int,
    latestMessage: MessageItem?,
    onToggle: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp)
            .clip(RoundedCornerShape(16.dp))
            .background(Accent.copy(alpha = 0.08f))
            .border(
                width = 1.dp,
                color = Accent.copy(alpha = 0.18f),
                shape = RoundedCornerShape(16.dp),
            )
            .clickable(onClick = onToggle)
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(10.dp)
                .clip(CircleShape)
                .background(Accent),
        )
        Spacer(Modifier.width(10.dp))
        Column(modifier = Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = "Visible Simulation",
                    style = TextStyle(
                        fontSize = 12.sp,
                        fontWeight = FontWeight.SemiBold,
                        letterSpacing = 0.9.sp,
                    ),
                    color = TextPrimary,
                )
                Spacer(Modifier.width(8.dp))
                Text(
                    text = count.toString(),
                    style = TextStyle(
                        fontSize = 11.sp,
                        fontWeight = FontWeight.SemiBold,
                    ),
                    color = TextSecondary,
                )
            }
            latestMessage?.let { latest ->
                Spacer(Modifier.height(2.dp))
                Text(
                    text = "${formatSimulationSender(latest.sender, latest.simulationId != null)}: ${latest.text}",
                    style = TextStyle(fontSize = 11.sp, lineHeight = 15.sp),
                    color = TextMuted,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        Spacer(Modifier.width(10.dp))
        Text(
            text = if (collapsed) "Показать" else "Свернуть",
            style = TextStyle(
                fontSize = 11.sp,
                fontWeight = FontWeight.Medium,
            ),
            color = TextSecondary,
        )
    }
}

@Composable
private fun MessageBubble(
    message: MessageItem,
    isFirstInGroup: Boolean,
    isLastInGroup: Boolean,
) {
    val timeFormatter = remember { SimpleDateFormat("HH:mm", Locale.getDefault()) }
    val timeLabel = remember(message.timestampMillis) {
        timeFormatter.format(Date(message.timestampMillis))
    }
    val displaySender = remember(message.sender, message.simulationId) {
        formatSimulationSender(message.sender, message.simulationId != null)
    }

    when (message.type) {
        MessageType.INFO -> SystemChipRow(
            text = message.text,
            icon = Icons.Rounded.Info,
            background = InfoSoft,
            contentColor = InfoBlue,
        )

        MessageType.ERROR -> SystemChipRow(
            text = message.text,
            icon = Icons.Rounded.Info,
            background = ErrorRed.copy(alpha = 0.14f),
            contentColor = ErrorRed,
        )

        MessageType.OWN -> OwnBubble(
            text = message.text,
            time = timeLabel,
            showTime = isLastInGroup,
            isSimulation = message.simulationId != null,
        )

        MessageType.OTHER -> IncomingBubble(
            sender = displaySender,
            text = message.text,
            time = timeLabel,
            showSender = isFirstInGroup,
            showTime = isLastInGroup,
            showAvatar = isFirstInGroup,
            isSimulation = message.simulationId != null,
        )
    }
}

@Composable
private fun OwnBubble(
    text: String,
    time: String,
    showTime: Boolean,
    isSimulation: Boolean,
) {
    val shape = RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp, bottomEnd = 4.dp, bottomStart = 16.dp)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp),
        horizontalArrangement = Arrangement.End,
    ) {
        Column(
            horizontalAlignment = Alignment.End,
            modifier = Modifier.widthIn(max = 320.dp),
        ) {
            Box(
                modifier = Modifier
                    .clip(shape)
                    .background(AccentMuted)
                    .border(1.dp, AccentBorder, shape)
                    .simulationBubbleOutline(shape = shape, enabled = isSimulation)
                    .padding(horizontal = 13.dp, vertical = 9.dp),
            ) {
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    if (isSimulation) {
                        SimulationBadge()
                    }
                    Text(
                        text = text,
                        style = TextStyle(
                            fontSize = 14.sp,
                            lineHeight = 20.sp,
                            color = TextPrimary,
                        ),
                    )
                }
            }
            if (showTime) {
                Spacer(Modifier.height(3.dp))
                Text(
                    text = "$time · ✓✓",
                    style = TextStyle(
                        fontSize = 10.sp,
                        fontFamily = FontFamily.Monospace,
                    ),
                    color = TextFaint,
                    modifier = Modifier.padding(end = 4.dp),
                )
            }
        }
    }
}

@Composable
private fun IncomingBubble(
    sender: String,
    text: String,
    time: String,
    showSender: Boolean,
    showTime: Boolean,
    showAvatar: Boolean,
    isSimulation: Boolean,
) {
    val isServer = sender == "Server"
    val shape = RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp, bottomEnd = 16.dp, bottomStart = 4.dp)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp),
        horizontalArrangement = Arrangement.Start,
        verticalAlignment = Alignment.Top,
    ) {
        if (showAvatar) {
            Avatar(name = sender, size = 28.dp, online = true)
        } else {
            Spacer(Modifier.width(28.dp))
        }
        Spacer(Modifier.width(10.dp))
        Column(
            horizontalAlignment = Alignment.Start,
            modifier = Modifier.widthIn(max = 320.dp),
        ) {
            if (showSender) {
                Text(
                    text = sender,
                    style = TextStyle(
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Medium,
                    ),
                    color = if (isServer) InfoBlue else TextMuted,
                    modifier = Modifier.padding(start = 4.dp, bottom = 3.dp),
                )
            }
            Box(
                modifier = Modifier
                    .clip(shape)
                    .background(ElevatedCard)
                    .border(1.dp, BorderSoft, shape)
                    .simulationBubbleOutline(shape = shape, enabled = isSimulation)
                    .padding(horizontal = 13.dp, vertical = 9.dp),
            ) {
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    if (isSimulation) {
                        SimulationBadge()
                    }
                    Row(verticalAlignment = Alignment.Top) {
                        if (isServer && showSender) {
                            Icon(
                                imageVector = Icons.Rounded.Settings,
                                contentDescription = null,
                                tint = InfoBlue,
                                modifier = Modifier
                                    .size(14.dp)
                                    .padding(end = 6.dp, top = 3.dp),
                            )
                        }
                        Text(
                            text = text,
                            style = TextStyle(
                                fontSize = 14.sp,
                                lineHeight = 20.sp,
                                color = TextPrimary,
                            ),
                        )
                    }
                }
            }
            if (showTime) {
                Spacer(Modifier.height(3.dp))
                Text(
                    text = time,
                    style = TextStyle(
                        fontSize = 10.sp,
                        fontFamily = FontFamily.Monospace,
                    ),
                    color = TextFaint,
                    modifier = Modifier.padding(start = 4.dp),
                )
            }
        }
    }
}

private fun Modifier.simulationBubbleOutline(
    shape: RoundedCornerShape,
    enabled: Boolean,
): Modifier = if (!enabled) {
    this
} else {
    drawBehind {
        val stroke = Stroke(
            width = 1.4.dp.toPx(),
            pathEffect = PathEffect.dashPathEffect(floatArrayOf(10f, 7f)),
        )
        when (val outline = shape.createOutline(size, layoutDirection, this)) {
            is Outline.Rounded -> {
                val roundRect = outline.roundRect
                drawRoundRect(
                    color = SimulationOutline,
                    topLeft = Offset(roundRect.left, roundRect.top),
                    size = Size(roundRect.width, roundRect.height),
                    cornerRadius = roundRect.topLeftCornerRadius,
                    style = stroke,
                )
            }

            is Outline.Rectangle -> {
                val rect = outline.rect
                drawRect(
                    color = SimulationOutline,
                    topLeft = Offset(rect.left, rect.top),
                    size = Size(rect.width, rect.height),
                    style = stroke,
                )
            }

            is Outline.Generic -> {
                drawPath(
                    path = outline.path,
                    color = SimulationOutline,
                    style = stroke,
                )
            }
        }
    }
}

@Composable
private fun SimulationBadge() {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(999.dp))
            .background(Accent.copy(alpha = 0.12f))
            .border(
                width = 1.dp,
                color = Accent.copy(alpha = 0.18f),
                shape = RoundedCornerShape(999.dp),
            )
            .padding(horizontal = 8.dp, vertical = 3.dp),
    ) {
        Text(
            text = "СИМУЛЯЦИЯ",
            style = TextStyle(
                fontSize = 9.sp,
                fontWeight = FontWeight.Medium,
                letterSpacing = 0.7.sp,
            ),
            color = Accent,
        )
    }
}

@Composable
private fun SystemChipRow(
    text: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    background: Color,
    contentColor: Color,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp),
        horizontalArrangement = Arrangement.Center,
    ) {
        Row(
            modifier = Modifier
                .clip(RoundedCornerShape(999.dp))
                .background(background)
                .border(1.dp, contentColor.copy(alpha = 0.24f), RoundedCornerShape(999.dp))
                .padding(horizontal = 12.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = contentColor,
                modifier = Modifier.size(13.dp),
            )
            Spacer(Modifier.width(6.dp))
            Text(
                text = text,
                style = TextStyle(
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Medium,
                ),
                color = contentColor,
            )
        }
    }
}

// ─────────────────────── Composer ───────────────────────

@Composable
private fun ComposerArea(
    chats: List<ChatContext>,
    activeChat: ChatContext?,
    activeChatId: String?,
    draft: String,
    canSend: Boolean,
    groupMode: GroupMode,
    selectedClients: Set<String>,
    onDraftChange: (String) -> Unit,
    onSwitchChat: (String) -> Unit,
    onSend: () -> Unit,
) {
    val placeholderText = when {
        !canSend -> "Выберите адресатов..."
        activeChat?.kind == ChatContextKind.GENERAL -> "Сообщение в General..."
        groupMode == GroupMode.CUSTOM && selectedClients.isNotEmpty() -> {
            "Сообщение для: ${selectedClients.sorted().joinToString(", ")}..."
        }
        else -> "Введите сообщение…"
    }

    val recipientSummary = when (groupMode) {
        GroupMode.ALL -> "Все адресаты"
        GroupMode.NONE -> "Без адресатов"
        GroupMode.CUSTOM -> when (selectedClients.size) {
            0 -> "Выберите адресатов"
            1 -> selectedClients.first()
            else -> "${selectedClients.size} получателей"
        }
    }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .drawBehind {
                drawLine(
                    color = BorderSoft,
                    start = Offset(0f, 0f),
                    end = Offset(size.width, 0f),
                    strokeWidth = 1.dp.toPx(),
                )
            }
            .background(AppBackground)
            .padding(start = 16.dp, end = 16.dp, top = 10.dp, bottom = 14.dp),
    ) {
        // Chat switcher chips — active chip wears the accent recipient-pill look
        FlowRow(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
            maxItemsInEachRow = 4,
        ) {
            if (chats.isEmpty()) {
                RecipientChip(
                    title = "Current chat",
                    count = null,
                    active = true,
                    hasUnread = false,
                    onClick = {},
                )
            } else {
                chats.forEach { chat ->
                    RecipientChip(
                        title = chat.title,
                        count = chat.participants.takeIf { it.isNotEmpty() }?.size,
                        active = chat.id == activeChatId,
                        hasUnread = chat.hasUnread,
                        onClick = { onSwitchChat(chat.id) },
                    )
                }
            }
            Text(
                text = recipientSummary,
                style = TextStyle(fontSize = 11.sp),
                color = TextFaint,
                modifier = Modifier.padding(vertical = 6.dp, horizontal = 2.dp),
            )
        }

        Spacer(Modifier.height(10.dp))

        // Composer pill
        val composerShape = RoundedCornerShape(26.dp)
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(composerShape)
                .background(MainSurface)
                .border(1.dp, BorderSoft, composerShape)
                .padding(start = 16.dp, end = 6.dp, top = 6.dp, bottom = 6.dp),
            verticalAlignment = Alignment.Bottom,
        ) {
            Box(
                modifier = Modifier
                    .weight(1f)
                    .padding(vertical = 8.dp),
            ) {
                if (draft.isEmpty()) {
                    Text(
                        text = placeholderText,
                        style = TextStyle(fontSize = 14.5.sp),
                        color = TextMuted,
                    )
                }
                BasicTextField(
                    value = draft,
                    onValueChange = onDraftChange,
                    enabled = canSend,
                    textStyle = TextStyle(
                        fontSize = 14.5.sp,
                        color = TextPrimary,
                        lineHeight = 20.sp,
                    ),
                    cursorBrush = SolidColor(Accent),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Text),
                    modifier = Modifier.fillMaxWidth(),
                    maxLines = 5,
                )
            }

            Spacer(Modifier.width(6.dp))

            val sendEnabled = draft.trim().isNotEmpty() && canSend
            SendButton(enabled = sendEnabled, onClick = onSend)
        }
    }
}

@Composable
private fun RecipientChip(
    title: String,
    count: Int?,
    active: Boolean,
    hasUnread: Boolean,
    onClick: () -> Unit,
) {
    val shape = RoundedCornerShape(999.dp)
    val bg = if (active) AccentMuted else ElevatedCard
    val borderColor = if (active) AccentBorder else BorderSoft
    val textColor = if (active) Accent else TextSecondary

    Row(
        modifier = Modifier
            .heightIn(min = 28.dp)
            .clip(shape)
            .background(bg)
            .border(1.dp, borderColor, shape)
            .clickable(onClick = onClick)
            .padding(start = 10.dp, end = 12.dp, top = 5.dp, bottom = 5.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (active) {
            Box(
                modifier = Modifier
                    .size(5.dp)
                    .clip(CircleShape)
                    .background(Accent),
            )
            Spacer(Modifier.width(6.dp))
        }
        Text(
            text = title,
            style = TextStyle(
                fontSize = 12.sp,
                fontWeight = FontWeight.Medium,
            ),
            color = textColor,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        if (count != null) {
            Spacer(Modifier.width(4.dp))
            Text(
                text = "· $count",
                style = TextStyle(fontSize = 12.sp),
                color = TextMuted,
            )
        }
        if (hasUnread) {
            Spacer(Modifier.width(8.dp))
            Box(
                modifier = Modifier
                    .size(6.dp)
                    .clip(CircleShape)
                    .background(ErrorRed),
            )
        }
    }
}

@Composable
private fun SendButton(enabled: Boolean, onClick: () -> Unit) {
    val bg = if (enabled) Accent else ElevatedCard
    val tint = if (enabled) AccentOnBubble else TextFaint

    Box(
        modifier = Modifier
            .size(36.dp)
            .clip(CircleShape)
            .background(bg)
            .clickable(enabled = enabled, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = Icons.Rounded.ArrowUpward,
            contentDescription = "Отправить сообщение",
            tint = tint,
            modifier = Modifier.size(18.dp),
        )
    }
}
