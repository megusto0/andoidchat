package com.megusto.tcpmessenger.android.ui

import android.content.Context
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ChatBubbleOutline
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.scale
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.megusto.tcpmessenger.android.data.ConnectionStatus
import com.megusto.tcpmessenger.android.data.DiscoveredServer
import com.megusto.tcpmessenger.android.ui.theme.Accent
import com.megusto.tcpmessenger.android.ui.theme.AccentOnBubble
import com.megusto.tcpmessenger.android.ui.theme.ErrorRed
import com.megusto.tcpmessenger.android.ui.theme.LoginAccentDim
import com.megusto.tcpmessenger.android.ui.theme.LoginAccentLine
import com.megusto.tcpmessenger.android.ui.theme.LoginBackgroundBottom
import com.megusto.tcpmessenger.android.ui.theme.LoginBackgroundTop
import com.megusto.tcpmessenger.android.ui.theme.LoginTextMuted
import com.megusto.tcpmessenger.android.ui.theme.LoginTextPrimary
import com.megusto.tcpmessenger.android.ui.theme.LoginUnderlineIdle
import com.megusto.tcpmessenger.android.ui.theme.LoginWarning
import com.megusto.tcpmessenger.android.ui.theme.MessengerType
import com.megusto.tcpmessenger.android.ui.theme.TcpMessengerTheme
import kotlinx.coroutines.launch

private sealed interface DiscoveryUiState {
    data object Searching : DiscoveryUiState
    data class Found(val ip: String, val port: Int) : DiscoveryUiState
    data object NotFound : DiscoveryUiState
}

@Composable
fun LoginScreen(
    status: ConnectionStatus,
    error: String?,
    onConnect: (host: String, port: String, name: String) -> Unit,
    onDiscoverServer: suspend (Context) -> DiscoveredServer?,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var discoveryState by remember { mutableStateOf<DiscoveryUiState>(DiscoveryUiState.Searching) }

    fun runDiscovery() {
        scope.launch {
            discoveryState = DiscoveryUiState.Searching
            val discovered = onDiscoverServer(context)
            discoveryState = discovered
                ?.let { DiscoveryUiState.Found(it.host, it.port) }
                ?: DiscoveryUiState.NotFound
        }
    }

    LaunchedEffect(Unit) { runDiscovery() }

    LoginScreenContent(
        discoveryState = discoveryState,
        connecting = status == ConnectionStatus.CONNECTING,
        error = error,
        onRetry = { runDiscovery() },
        onConnect = onConnect,
    )
}

@Composable
private fun LoginScreenContent(
    discoveryState: DiscoveryUiState,
    connecting: Boolean,
    error: String?,
    onRetry: () -> Unit,
    onConnect: (host: String, port: String, name: String) -> Unit,
) {
    var manualRevealed by rememberSaveable { mutableStateOf(false) }
    var manualIp by rememberSaveable { mutableStateOf("") }
    var manualPort by rememberSaveable { mutableStateOf("5000") }
    var name by rememberSaveable { mutableStateOf("") }
    var prefilledFromDiscovery by rememberSaveable { mutableStateOf(false) }

    // Seed the manual fields once with the first successful discovery so flipping
    // to "Другой" shows the already-found values instead of an empty form.
    LaunchedEffect(discoveryState) {
        if (prefilledFromDiscovery) return@LaunchedEffect
        val found = discoveryState as? DiscoveryUiState.Found ?: return@LaunchedEffect
        manualIp = found.ip
        manualPort = found.port.toString()
        prefilledFromDiscovery = true
    }

    val found = discoveryState as? DiscoveryUiState.Found
    val useDiscovered = found != null && !manualRevealed
    val effectiveHost = if (useDiscovered) found!!.ip else manualIp.trim()
    val effectivePort = if (useDiscovered) found!!.port.toString() else manualPort.trim()
    val manualFieldsVisible = manualRevealed || discoveryState is DiscoveryUiState.NotFound

    val canConnect = !connecting &&
        name.trim().isNotEmpty() &&
        effectiveHost.isNotEmpty() &&
        (effectivePort.toIntOrNull()?.let { it in 1..65_535 } == true)

    Box(
        Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(listOf(LoginBackgroundTop, LoginBackgroundBottom)),
            ),
    ) {
        AccentGlow(Modifier.fillMaxSize())

        Column(
            modifier = Modifier
                .fillMaxSize()
                .statusBarsPadding()
                .navigationBarsPadding()
                .imePadding()
                .padding(horizontal = 24.dp),
        ) {
            Spacer(Modifier.height(48.dp))
            HeroSection(Modifier.fillMaxWidth())
            Spacer(Modifier.height(40.dp))

            Column(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState()),
            ) {
                DiscoveryPill(
                    state = discoveryState,
                    showingManual = manualRevealed,
                    onManualToggle = { manualRevealed = !manualRevealed },
                    onRetry = onRetry,
                    modifier = Modifier.fillMaxWidth(),
                )

                AnimatedVisibility(
                    visible = manualFieldsVisible,
                    enter = expandVertically(tween(220)) + fadeIn(tween(220)),
                    exit = shrinkVertically(tween(220)) + fadeOut(tween(220)),
                ) {
                    ManualConnectionFields(
                        ip = manualIp,
                        port = manualPort,
                        onIpChange = { manualIp = it },
                        onPortChange = { raw -> manualPort = raw.filter(Char::isDigit).take(5) },
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 24.dp),
                    )
                }

                Spacer(Modifier.height(28.dp))

                NameField(
                    name = name,
                    onNameChange = { name = it },
                    modifier = Modifier.fillMaxWidth(),
                )

                Spacer(Modifier.height(20.dp))
            }

            if (!error.isNullOrBlank()) {
                Text(
                    text = error,
                    style = MessengerType.BodyMuted,
                    color = ErrorRed,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(bottom = 12.dp),
                )
            }

            ConnectButton(
                enabled = canConnect,
                loading = connecting,
                onClick = { onConnect(effectiveHost, effectivePort, name.trim()) },
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = 32.dp),
            )
        }
    }
}

@Composable
private fun AccentGlow(modifier: Modifier = Modifier) {
    Box(
        modifier = modifier.drawBehind {
            val radius = size.maxDimension * 0.75f
            drawCircle(
                color = Accent,
                radius = radius,
                alpha = 0.08f,
                center = Offset(size.width + radius * 0.35f, -radius * 0.35f),
            )
        },
    )
}

@Composable
private fun HeroSection(modifier: Modifier = Modifier) {
    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            modifier = Modifier
                .size(76.dp)
                .background(LoginAccentDim, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = Icons.Rounded.ChatBubbleOutline,
                contentDescription = null,
                tint = Accent,
                modifier = Modifier.size(34.dp),
            )
        }
        Spacer(Modifier.height(24.dp))
        Text(
            text = "TCP Messenger",
            style = MessengerType.Display,
            color = LoginTextPrimary,
        )
        Spacer(Modifier.height(8.dp))
        Text(
            text = "Локальный чат по TCP",
            style = MessengerType.BodyMuted,
            color = LoginTextMuted,
        )
    }
}

@Composable
private fun DiscoveryPill(
    state: DiscoveryUiState,
    showingManual: Boolean,
    onManualToggle: () -> Unit,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val shape = RoundedCornerShape(percent = 50)
    Row(
        modifier = modifier
            .height(56.dp)
            .background(LoginAccentDim, shape)
            .border(1.dp, LoginAccentLine, shape)
            .padding(horizontal = 20.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        when (state) {
            DiscoveryUiState.Searching -> {
                CircularProgressIndicator(
                    modifier = Modifier.size(16.dp),
                    strokeWidth = 2.dp,
                    color = Accent,
                )
                Spacer(Modifier.width(14.dp))
                Text(
                    text = "Ищу сервер в сети…",
                    style = MessengerType.BodyMuted,
                    color = LoginTextMuted,
                )
            }

            is DiscoveryUiState.Found -> {
                PulsingDot(color = Accent, size = 8.dp)
                Spacer(Modifier.width(14.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "Сервер найден",
                        style = MessengerType.Label,
                        color = LoginTextMuted,
                    )
                    Text(
                        text = "${state.ip}:${state.port}",
                        style = MessengerType.Mono,
                        color = LoginTextPrimary,
                    )
                }
                GhostAction(
                    text = if (showingManual) "Отмена" else "Другой",
                    onClick = onManualToggle,
                )
            }

            DiscoveryUiState.NotFound -> {
                Box(
                    modifier = Modifier
                        .size(8.dp)
                        .background(LoginWarning, CircleShape),
                )
                Spacer(Modifier.width(14.dp))
                Text(
                    text = "Сервер не найден",
                    style = MessengerType.BodyMuted,
                    color = LoginTextPrimary,
                    modifier = Modifier.weight(1f),
                )
                GhostAction(text = "Повторить", onClick = onRetry)
            }
        }
    }
}

@Composable
private fun PulsingDot(color: Color, size: Dp) {
    val transition = rememberInfiniteTransition(label = "pulse")
    val scale by transition.animateFloat(
        initialValue = 1f,
        targetValue = 1.2f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 800, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "pulse-scale",
    )
    val alpha by transition.animateFloat(
        initialValue = 0.6f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 800, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "pulse-alpha",
    )
    Box(
        modifier = Modifier
            .size(size)
            .scale(scale)
            .alpha(alpha)
            .background(color, CircleShape),
    )
}

@Composable
private fun GhostAction(
    text: String,
    onClick: () -> Unit,
) {
    Text(
        text = text,
        style = MessengerType.BodyMuted,
        color = Accent,
        modifier = Modifier
            .clickable(onClick = onClick)
            .padding(horizontal = 8.dp, vertical = 8.dp),
    )
}

@Composable
private fun ManualConnectionFields(
    ip: String,
    port: String,
    onIpChange: (String) -> Unit,
    onPortChange: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier,
        verticalArrangement = Arrangement.spacedBy(20.dp),
    ) {
        UnderlineTextField(
            value = ip,
            onValueChange = onIpChange,
            label = "IP-адрес",
            monospace = true,
            keyboardType = KeyboardType.Uri,
        )
        UnderlineTextField(
            value = port,
            onValueChange = onPortChange,
            label = "Порт",
            keyboardType = KeyboardType.Number,
            monospace = true,
        )
    }
}

@Composable
private fun NameField(
    name: String,
    onNameChange: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val focusRequester = remember { FocusRequester() }
    LaunchedEffect(Unit) {
        if (name.isEmpty()) {
            runCatching { focusRequester.requestFocus() }
        }
    }
    UnderlineTextField(
        value = name,
        onValueChange = onNameChange,
        label = "Имя",
        modifier = modifier,
        imeAction = ImeAction.Done,
        focusRequester = focusRequester,
    )
}

@Composable
private fun UnderlineTextField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
    keyboardType: KeyboardType = KeyboardType.Text,
    imeAction: ImeAction = ImeAction.Next,
    monospace: Boolean = false,
    focusRequester: FocusRequester? = null,
) {
    var focused by remember { mutableStateOf(false) }
    val underlineColor by animateColorAsState(
        targetValue = if (focused) Accent else LoginUnderlineIdle,
        animationSpec = tween(durationMillis = 150),
        label = "underline-color",
    )

    val baseStyle = if (monospace) MessengerType.Mono else MessengerType.Input
    val textFieldStyle = baseStyle.copy(color = LoginTextPrimary)

    val inputModifier = Modifier
        .fillMaxWidth()
        .onFocusChanged { focused = it.isFocused }
        .let { if (focusRequester != null) it.focusRequester(focusRequester) else it }

    Column(modifier = modifier) {
        Text(
            text = label,
            style = MessengerType.Label,
            color = if (focused) Accent else LoginTextMuted,
        )
        Spacer(Modifier.height(8.dp))
        BasicTextField(
            value = value,
            onValueChange = onValueChange,
            singleLine = true,
            textStyle = textFieldStyle,
            cursorBrush = SolidColor(Accent),
            keyboardOptions = KeyboardOptions(
                keyboardType = keyboardType,
                imeAction = imeAction,
            ),
            modifier = inputModifier.padding(vertical = 6.dp),
        )
        Spacer(Modifier.height(8.dp))
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(1.dp)
                .background(underlineColor),
        )
    }
}

@Composable
private fun ConnectButton(
    enabled: Boolean,
    loading: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val interactionSource = remember { MutableInteractionSource() }
    val pressed by interactionSource.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (pressed && enabled) 0.98f else 1f,
        animationSpec = tween(durationMillis = 100),
        label = "press-scale",
    )
    val alpha by animateFloatAsState(
        targetValue = when {
            !enabled -> 0.35f
            pressed -> 0.92f
            else -> 1f
        },
        animationSpec = tween(durationMillis = 100),
        label = "press-alpha",
    )

    Box(
        modifier = modifier
            .height(56.dp)
            .scale(scale)
            .alpha(alpha)
            .background(Accent, RoundedCornerShape(16.dp))
            .clickable(
                interactionSource = interactionSource,
                indication = null,
                enabled = enabled,
                onClick = onClick,
            ),
        contentAlignment = Alignment.Center,
    ) {
        if (loading) {
            CircularProgressIndicator(
                modifier = Modifier.size(22.dp),
                strokeWidth = 2.dp,
                color = AccentOnBubble,
            )
        } else {
            Text(
                text = "Подключиться",
                style = MessengerType.Button,
                color = AccentOnBubble,
            )
        }
    }
}

@Preview(
    name = "Login · discovery found",
    showBackground = true,
    backgroundColor = 0xFF0E0E11,
    widthDp = 411,
    heightDp = 914,
)
@Composable
private fun LoginScreenPreviewFound() {
    TcpMessengerTheme {
        LoginScreenContent(
            discoveryState = DiscoveryUiState.Found("192.168.1.42", 5000),
            connecting = false,
            error = null,
            onRetry = {},
            onConnect = { _, _, _ -> },
        )
    }
}

@Preview(
    name = "Login · searching",
    showBackground = true,
    backgroundColor = 0xFF0E0E11,
    widthDp = 411,
    heightDp = 914,
)
@Composable
private fun LoginScreenPreviewSearching() {
    TcpMessengerTheme {
        LoginScreenContent(
            discoveryState = DiscoveryUiState.Searching,
            connecting = false,
            error = null,
            onRetry = {},
            onConnect = { _, _, _ -> },
        )
    }
}

@Preview(
    name = "Login · manual",
    showBackground = true,
    backgroundColor = 0xFF0E0E11,
    widthDp = 411,
    heightDp = 914,
)
@Composable
private fun LoginScreenPreviewManual() {
    TcpMessengerTheme {
        LoginScreenContent(
            discoveryState = DiscoveryUiState.NotFound,
            connecting = false,
            error = null,
            onRetry = {},
            onConnect = { _, _, _ -> },
        )
    }
}
