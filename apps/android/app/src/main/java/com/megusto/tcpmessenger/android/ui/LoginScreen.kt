@file:OptIn(ExperimentalLayoutApi::class)

package com.megusto.tcpmessenger.android.ui

import android.content.Context
import android.content.res.Configuration
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.isImeVisible
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ChatBubbleOutline
import androidx.compose.material.icons.rounded.WarningAmber
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.scale
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.PlatformTextStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.lerp
import androidx.compose.ui.unit.sp
import com.megusto.tcpmessenger.android.data.ConnectionStatus
import com.megusto.tcpmessenger.android.data.DiscoveredServer
import com.megusto.tcpmessenger.android.ui.theme.Accent
import com.megusto.tcpmessenger.android.ui.theme.AccentBorder
import com.megusto.tcpmessenger.android.ui.theme.AccentDim
import com.megusto.tcpmessenger.android.ui.theme.AccentMuted
import com.megusto.tcpmessenger.android.ui.theme.AccentOnBubble
import com.megusto.tcpmessenger.android.ui.theme.AppBackground
import com.megusto.tcpmessenger.android.ui.theme.BorderSoft
import com.megusto.tcpmessenger.android.ui.theme.ElevatedCard
import com.megusto.tcpmessenger.android.ui.theme.ErrorRed
import com.megusto.tcpmessenger.android.ui.theme.LoginBackgroundBottom
import com.megusto.tcpmessenger.android.ui.theme.MainSurface
import com.megusto.tcpmessenger.android.ui.theme.MessengerType
import com.megusto.tcpmessenger.android.ui.theme.TcpMessengerTheme
import com.megusto.tcpmessenger.android.ui.theme.TextFaint
import com.megusto.tcpmessenger.android.ui.theme.TextMuted
import com.megusto.tcpmessenger.android.ui.theme.TextPrimary
import com.megusto.tcpmessenger.android.ui.theme.TextSecondary
import com.megusto.tcpmessenger.android.ui.theme.Warn
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
    overrideCollapseProgress: Float? = null,
) {
    var ip by rememberSaveable { mutableStateOf("") }
    var port by rememberSaveable { mutableStateOf("5000") }
    var name by rememberSaveable { mutableStateOf("") }
    var prefilledFromDiscovery by rememberSaveable { mutableStateOf(false) }
    var showManualConnectionFields by rememberSaveable { mutableStateOf(false) }

    LaunchedEffect(discoveryState) {
        when (val state = discoveryState) {
            is DiscoveryUiState.Found -> {
                if (!prefilledFromDiscovery) {
                    ip = state.ip
                    port = state.port.toString()
                    prefilledFromDiscovery = true
                }
                showManualConnectionFields = false
            }

            DiscoveryUiState.NotFound -> {
                showManualConnectionFields = true
            }

            DiscoveryUiState.Searching -> Unit
        }
    }

    val effectiveHost = ip.trim()
    val effectivePort = port.trim()
    val canConnect = !connecting &&
        name.trim().isNotEmpty() &&
        effectiveHost.isNotEmpty() &&
        (effectivePort.toIntOrNull()?.let { it in 1..65_535 } == true)

    // Single source of truth that drives every hero interpolation. The hero
    // collapses when the IME is up, the screen is too short for a big header,
    // or we're in landscape. Previews can override via [overrideCollapseProgress].
    val imeVisible = WindowInsets.isImeVisible
    val configuration = LocalConfiguration.current
    val forceCollapse = imeVisible ||
        configuration.screenHeightDp < 600 ||
        configuration.orientation == Configuration.ORIENTATION_LANDSCAPE
    val collapseProgress = overrideCollapseProgress ?: if (forceCollapse) 1f else 0f

    Box(
        Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(listOf(AppBackground, LoginBackgroundBottom)),
            ),
    ) {
        AccentGlow(Modifier.fillMaxSize())

        Column(
            modifier = Modifier
                .fillMaxSize()
                .statusBarsPadding()
                .navigationBarsPadding()
                .imePadding()
                .padding(horizontal = 28.dp),
        ) {
            Spacer(Modifier.height(lerp(40.dp, 16.dp, collapseProgress)))

            CollapsingHero(
                progress = collapseProgress,
                modifier = Modifier.fillMaxWidth(),
            )

            Spacer(Modifier.height(lerp(28.dp, 16.dp, collapseProgress)))

            Column {
                DiscoveryCard(
                    state = discoveryState,
                    showManualConnectionFields = showManualConnectionFields,
                    onRetry = onRetry,
                    onToggleManualFields = {
                        showManualConnectionFields = !showManualConnectionFields
                    },
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(20.dp))
            }

            if (showManualConnectionFields) {
                Column {
                    BoxedTextField(
                        label = "IP-адрес",
                        value = ip,
                        onValueChange = { ip = it },
                        monospace = true,
                        keyboardType = KeyboardType.Uri,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Spacer(Modifier.height(14.dp))

                    BoxedTextField(
                        label = "Порт",
                        value = port,
                        onValueChange = { raw -> port = raw.filter(Char::isDigit).take(5) },
                        monospace = true,
                        keyboardType = KeyboardType.Number,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Spacer(Modifier.height(14.dp))
                }
            }

            val nameFocusRequester = remember { FocusRequester() }
            LaunchedEffect(Unit) {
                if (name.isEmpty()) runCatching { nameFocusRequester.requestFocus() }
            }
            BoxedTextField(
                label = "Имя",
                value = name,
                onValueChange = { name = it },
                placeholder = "Введите имя",
                imeAction = ImeAction.Done,
                focusRequester = nameFocusRequester,
                modifier = Modifier.fillMaxWidth(),
            )

            // Keeps the button anchored above the keyboard (or nav bar) while
            // the form absorbs slack from the collapsed hero.
            Spacer(Modifier.weight(1f))

            if (!error.isNullOrBlank()) {
                Spacer(Modifier.height(8.dp))
                Text(
                    text = error,
                    style = MessengerType.BodyMuted,
                    color = ErrorRed,
                    modifier = Modifier.fillMaxWidth(),
                )
            }

            Spacer(Modifier.height(4.dp))

            ConnectButton(
                enabled = canConnect,
                loading = connecting,
                onClick = { onConnect(effectiveHost, effectivePort, name.trim()) },
                modifier = Modifier.fillMaxWidth(),
            )

            Spacer(Modifier.height(14.dp))

            Text(
                text = "TCP · v1.4.0",
                style = TextStyle(
                    fontSize = 11.5.sp,
                    fontFamily = FontFamily.Monospace,
                    fontWeight = FontWeight.Normal,
                    letterSpacing = 0.5.sp,
                ),
                color = TextFaint,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth(),
            )

            Spacer(Modifier.height(24.dp))
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
private fun CollapsingHero(progress: Float, modifier: Modifier = Modifier) {
    val logoSize = lerp(72.dp, 40.dp, progress)
    val logoCorner = lerp(22.dp, 12.dp, progress)
    val iconSize = lerp(32.dp, 20.dp, progress)
    val logoTitleSpacing = lerp(18.dp, 10.dp, progress)
    val titleFontSize = lerp(26.sp, 18.sp, progress)
    val taglineVisible = progress < 0.35f

    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            modifier = Modifier
                .size(logoSize)
                .background(
                    brush = Brush.linearGradient(
                        colors = listOf(Accent, AccentDim),
                    ),
                    shape = RoundedCornerShape(logoCorner),
                ),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = Icons.Rounded.ChatBubbleOutline,
                contentDescription = null,
                tint = AccentOnBubble,
                modifier = Modifier.size(iconSize),
            )
        }
        Spacer(Modifier.height(logoTitleSpacing))
        Text(
            text = "TCP Messenger",
            style = TextStyle(
                fontSize = titleFontSize,
                fontWeight = FontWeight.Medium,
                letterSpacing = (-0.5).sp,
            ),
            color = TextPrimary,
        )
        if (taglineVisible) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Spacer(Modifier.height(4.dp))
                Text(
                    text = "Локальный чат по TCP",
                    style = TextStyle(
                        fontSize = 13.5.sp,
                        fontWeight = FontWeight.Normal,
                    ),
                    color = TextMuted,
                )
            }
        }
    }
}

@Composable
private fun DiscoveryCard(
    state: DiscoveryUiState,
    showManualConnectionFields: Boolean,
    onRetry: () -> Unit,
    onToggleManualFields: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val shape = RoundedCornerShape(14.dp)
    Row(
        modifier = modifier
            .clip(shape)
            .background(MainSurface)
            .border(1.dp, BorderSoft, shape)
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        DiscoveryIconBadge(state = state)
        Spacer(Modifier.width(12.dp))

        when (state) {
            DiscoveryUiState.Searching -> {
                Column(modifier = Modifier.weight(1f)) {
                    CardLabel("Поиск сервера")
                    Spacer(Modifier.height(2.dp))
                    Text(
                        text = "scanning 192.168…",
                        style = MessengerType.Mono.copy(fontSize = 13.sp),
                        color = TextMuted,
                    )
                }
            }

            is DiscoveryUiState.Found -> {
                Column(modifier = Modifier.weight(1f)) {
                    CardLabel("Сервер найден")
                    Spacer(Modifier.height(2.dp))
                    Text(
                        text = "${state.ip}:${state.port}",
                        style = MessengerType.Mono.copy(fontSize = 14.sp),
                        color = TextPrimary,
                    )
                }
                GhostAction(
                    text = if (showManualConnectionFields) "Авто" else "Вручную",
                    onClick = onToggleManualFields,
                )
            }

            DiscoveryUiState.NotFound -> {
                Column(modifier = Modifier.weight(1f)) {
                    CardLabel("Сервер не найден")
                    Spacer(Modifier.height(2.dp))
                    Text(
                        text = "Повторите поиск или введите адрес",
                        style = MessengerType.BodyMuted.copy(fontSize = 12.5.sp),
                        color = TextMuted,
                    )
                }
                GhostAction(text = "Повторить", onClick = onRetry)
            }
        }
    }
}

@Composable
private fun CardLabel(text: String) {
    Text(
        text = text,
        style = TextStyle(
            fontSize = 11.sp,
            fontWeight = FontWeight.Medium,
            letterSpacing = 0.3.sp,
        ),
        color = TextMuted,
    )
}

@Composable
private fun DiscoveryIconBadge(state: DiscoveryUiState) {
    val shape = RoundedCornerShape(10.dp)
    val bg: Color
    val border: Color
    val tint: Color
    when (state) {
        DiscoveryUiState.NotFound -> {
            bg = ElevatedCard
            border = BorderSoft
            tint = Warn
        }
        else -> {
            bg = AccentMuted
            border = AccentBorder
            tint = Accent
        }
    }
    Box(
        modifier = Modifier
            .size(38.dp)
            .clip(shape)
            .background(bg)
            .border(1.dp, border, shape),
        contentAlignment = Alignment.Center,
    ) {
        when (state) {
            DiscoveryUiState.Searching -> {
                CircularProgressIndicator(
                    modifier = Modifier.size(18.dp),
                    strokeWidth = 1.6.dp,
                    color = tint,
                )
            }
            is DiscoveryUiState.Found -> {
                RadarGlyph(
                    color = tint,
                    modifier = Modifier.size(20.dp),
                )
            }
            DiscoveryUiState.NotFound -> {
                Icon(
                    imageVector = Icons.Rounded.WarningAmber,
                    contentDescription = null,
                    tint = tint,
                    modifier = Modifier.size(20.dp),
                )
            }
        }
    }
}

@Composable
private fun RadarGlyph(color: Color, modifier: Modifier = Modifier) {
    Canvas(modifier = modifier) {
        val stroke = 1.6.dp.toPx()
        val side = size.minDimension
        val center = Offset(size.width / 2f, size.height / 2f)
        val rOuter = side * 0.42f
        val rInner = side * 0.16f

        drawCircle(
            color = color.copy(alpha = 0.5f),
            radius = rOuter,
            center = center,
            style = Stroke(width = stroke),
        )
        drawCircle(
            color = color,
            radius = rInner,
            center = center,
            style = Stroke(width = stroke),
        )
        // 45° sweep line
        val sweepEnd = Offset(
            x = center.x + rOuter * 0.71f,
            y = center.y - rOuter * 0.71f,
        )
        drawLine(
            color = color.copy(alpha = 0.8f),
            start = center,
            end = sweepEnd,
            strokeWidth = stroke,
            cap = StrokeCap.Round,
        )
    }
}

@Composable
private fun GhostAction(
    text: String,
    onClick: () -> Unit,
) {
    Text(
        text = text,
        style = TextStyle(
            fontSize = 13.sp,
            fontWeight = FontWeight.Medium,
        ),
        color = Accent,
        modifier = Modifier
            .clip(RoundedCornerShape(8.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = 8.dp, vertical = 6.dp),
    )
}

@Composable
private fun BoxedTextField(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    placeholder: String? = null,
    monospace: Boolean = false,
    keyboardType: KeyboardType = KeyboardType.Text,
    imeAction: ImeAction = ImeAction.Next,
    focusRequester: FocusRequester? = null,
) {
    var focused by remember { mutableStateOf(false) }
    val shape = RoundedCornerShape(10.dp)

    val borderColor by animateColorAsState(
        targetValue = if (focused) AccentBorder else BorderSoft,
        animationSpec = tween(durationMillis = 150),
        label = "field-border",
    )
    val labelColor by animateColorAsState(
        targetValue = if (focused) Accent else TextMuted,
        animationSpec = tween(durationMillis = 150),
        label = "field-label",
    )

    val baseStyle = if (monospace) {
        TextStyle(
            fontFamily = FontFamily.Monospace,
            fontSize = 15.sp,
            lineHeight = 20.sp,
            fontWeight = FontWeight.Medium,
        )
    } else {
        TextStyle(
            fontSize = 15.sp,
            lineHeight = 22.sp,
            fontWeight = FontWeight.Normal,
        )
    }

    val inputModifier = Modifier
        .fillMaxWidth()
        .onFocusChanged { focused = it.isFocused }
        .let { if (focusRequester != null) it.focusRequester(focusRequester) else it }

    Column(modifier = modifier) {
        Text(
            text = label,
            style = TextStyle(
                fontSize = 11.sp,
                fontWeight = FontWeight.Medium,
                letterSpacing = 0.3.sp,
            ),
            color = labelColor,
        )
        Spacer(Modifier.height(6.dp))
        TextField(
            value = value,
            onValueChange = onValueChange,
            singleLine = true,
            textStyle = baseStyle.copy(
                color = TextPrimary,
                platformStyle = PlatformTextStyle(includeFontPadding = true),
            ),
            placeholder = if (!placeholder.isNullOrEmpty()) {
                {
                    Text(
                        text = placeholder,
                        style = baseStyle,
                        color = TextMuted,
                    )
                }
            } else {
                null
            },
            keyboardOptions = KeyboardOptions(
                keyboardType = keyboardType,
                imeAction = imeAction,
            ),
            colors = TextFieldDefaults.colors(
                focusedTextColor = TextPrimary,
                unfocusedTextColor = TextPrimary,
                disabledTextColor = TextPrimary.copy(alpha = 0.6f),
                cursorColor = Accent,
                focusedContainerColor = MainSurface,
                unfocusedContainerColor = MainSurface,
                disabledContainerColor = MainSurface,
                errorContainerColor = MainSurface,
                focusedIndicatorColor = Color.Transparent,
                unfocusedIndicatorColor = Color.Transparent,
                disabledIndicatorColor = Color.Transparent,
                errorIndicatorColor = Color.Transparent,
                focusedPlaceholderColor = TextMuted,
                unfocusedPlaceholderColor = TextMuted,
                disabledPlaceholderColor = TextMuted,
            ),
            shape = shape,
            modifier = inputModifier
                .fillMaxWidth()
                .border(1.dp, borderColor, shape),
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
            .height(52.dp)
            .scale(scale)
            .alpha(alpha)
            .clip(RoundedCornerShape(14.dp))
            .background(Accent)
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
                style = TextStyle(
                    fontSize = 15.sp,
                    fontWeight = FontWeight.SemiBold,
                    letterSpacing = 0.2.sp,
                ),
                color = AccentOnBubble,
            )
        }
    }
}

@Preview(
    name = "Login · discovery found",
    showBackground = true,
    backgroundColor = 0xFF0B0B0C,
    widthDp = 411,
    heightDp = 914,
)
@Composable
private fun LoginScreenPreviewFound() {
    TcpMessengerTheme {
        LoginScreenContent(
            discoveryState = DiscoveryUiState.Found("192.168.3.19", 5000),
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
    backgroundColor = 0xFF0B0B0C,
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
    name = "Login · not found",
    showBackground = true,
    backgroundColor = 0xFF0B0B0C,
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

@Preview(
    name = "Login · keyboard open (collapsed)",
    showBackground = true,
    backgroundColor = 0xFF0B0B0C,
    widthDp = 411,
    heightDp = 914,
)
@Composable
private fun LoginScreenCollapsedPreview() {
    TcpMessengerTheme {
        LoginScreenContent(
            discoveryState = DiscoveryUiState.Found("192.168.3.19", 5000),
            connecting = false,
            error = null,
            onRetry = {},
            onConnect = { _, _, _ -> },
            overrideCollapseProgress = 1f,
        )
    }
}
