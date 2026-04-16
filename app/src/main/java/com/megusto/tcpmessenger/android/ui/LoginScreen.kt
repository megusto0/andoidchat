package com.megusto.tcpmessenger.android.ui

import android.content.Context
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ChatBubbleOutline
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.vector.rememberVectorPainter
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.megusto.tcpmessenger.android.data.ConnectionStatus
import com.megusto.tcpmessenger.android.data.DiscoveredServer
import com.megusto.tcpmessenger.android.ui.theme.Accent
import com.megusto.tcpmessenger.android.ui.theme.AppBackground
import com.megusto.tcpmessenger.android.ui.theme.BorderSoft
import com.megusto.tcpmessenger.android.ui.theme.ElevatedCard
import com.megusto.tcpmessenger.android.ui.theme.InputSurface
import com.megusto.tcpmessenger.android.ui.theme.TextMuted
import com.megusto.tcpmessenger.android.ui.theme.TextPrimary
import com.megusto.tcpmessenger.android.ui.theme.TextSecondary
import kotlinx.coroutines.launch

@Composable
fun LoginScreen(
    status: ConnectionStatus,
    error: String?,
    onConnect: (host: String, port: String, name: String) -> Unit,
    onDiscoverServer: suspend (Context) -> DiscoveredServer?,
) {
    var host by rememberSaveable { mutableStateOf("10.0.2.2") }
    var port by rememberSaveable { mutableStateOf("5000") }
    var name by rememberSaveable { mutableStateOf("") }
    var hostEdited by rememberSaveable { mutableStateOf(false) }
    var portEdited by rememberSaveable { mutableStateOf(false) }
    var discoveryState by rememberSaveable { mutableStateOf("searching") }
    var discoveryText by rememberSaveable {
        mutableStateOf("Ищем TCP-сервер в локальной сети…")
    }
    val connecting = status == ConnectionStatus.CONNECTING
    val scope = rememberCoroutineScope()
    val context = androidx.compose.ui.platform.LocalContext.current

    suspend fun runDiscovery(forceApply: Boolean) {
        discoveryState = "searching"
        discoveryText = "Ищем TCP-сервер в локальной сети…"

        val discovered = onDiscoverServer(context)
        if (discovered != null) {
            if (forceApply || !hostEdited) {
                host = discovered.host
            }
            if (forceApply || !portEdited) {
                port = discovered.port.toString()
            }
            discoveryState = "found"
            discoveryText = "Сервер найден автоматически: ${discovered.host}:${discovered.port}"
        } else {
            discoveryState = "not_found"
            discoveryText = "Сервер не найден автоматически. Укажите IP-адрес и порт вручную."
        }
    }

    LaunchedEffect(Unit) {
        runDiscovery(forceApply = false)
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    colors = listOf(
                        AppBackground,
                        ElevatedCard.copy(alpha = 0.92f),
                        AppBackground,
                    ),
                ),
            ),
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 20.dp, vertical = 24.dp),
            verticalArrangement = Arrangement.Top,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .widthIn(max = 520.dp),
                shape = RoundedCornerShape(28.dp),
                color = ElevatedCard,
                shadowElevation = 18.dp,
                tonalElevation = 4.dp,
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 22.dp, vertical = 24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Box(
                        modifier = Modifier
                            .size(72.dp)
                            .clip(RoundedCornerShape(22.dp))
                            .background(Accent.copy(alpha = 0.18f)),
                        contentAlignment = Alignment.Center,
                    ) {
                        androidx.compose.foundation.Image(
                            painter = rememberVectorPainter(Icons.Rounded.ChatBubbleOutline),
                            contentDescription = null,
                            modifier = Modifier.size(32.dp),
                        )
                    }

                    Spacer(modifier = Modifier.height(18.dp))

                    Text(
                        text = "TCP Messenger",
                        color = TextPrimary,
                        fontSize = 24.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = "Подключитесь к TCP-серверу для обмена сообщениями",
                        color = TextSecondary,
                        fontSize = 14.sp,
                        textAlign = TextAlign.Center,
                        lineHeight = 20.sp,
                    )

                    Spacer(modifier = Modifier.height(18.dp))
                    Surface(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(14.dp),
                        color = if (discoveryState == "found") {
                            Accent.copy(alpha = 0.10f)
                        } else {
                            InputSurface
                        },
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 14.dp, vertical = 12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            if (discoveryState == "searching") {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(16.dp),
                                    strokeWidth = 2.dp,
                                    color = Accent,
                                )
                                Spacer(modifier = Modifier.width(10.dp))
                            }
                            Text(
                                text = discoveryText,
                                color = if (discoveryState == "found") TextPrimary else TextSecondary,
                                fontSize = 13.sp,
                                lineHeight = 18.sp,
                                modifier = Modifier.weight(1f),
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(10.dp))
                    OutlinedButton(
                        modifier = Modifier.fillMaxWidth(),
                        onClick = { scope.launch { runDiscovery(forceApply = true) } },
                        enabled = discoveryState != "searching",
                        shape = RoundedCornerShape(18.dp),
                    ) {
                        Text("Найти сервер")
                    }

                    Spacer(modifier = Modifier.height(22.dp))

                    BoxWithConstraints(
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        val compact = maxWidth < 420.dp
                        if (compact) {
                            Column(
                                verticalArrangement = Arrangement.spacedBy(14.dp),
                            ) {
                                MessengerField(
                                    value = host,
                                    onValueChange = {
                                        hostEdited = true
                                        host = it
                                    },
                                    label = "IP-адрес",
                                    placeholder = "10.0.2.2",
                                )
                                MessengerField(
                                    value = port,
                                    onValueChange = {
                                        portEdited = true
                                        port = it
                                    },
                                    label = "Порт",
                                    placeholder = "5000",
                                    keyboardType = KeyboardType.Number,
                                )
                            }
                        } else {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(14.dp),
                            ) {
                                MessengerField(
                                    modifier = Modifier.weight(1f),
                                    value = host,
                                    onValueChange = {
                                        hostEdited = true
                                        host = it
                                    },
                                    label = "IP-адрес",
                                    placeholder = "10.0.2.2",
                                )
                                MessengerField(
                                    modifier = Modifier.width(140.dp),
                                    value = port,
                                    onValueChange = {
                                        portEdited = true
                                        port = it
                                    },
                                    label = "Порт",
                                    placeholder = "5000",
                                    keyboardType = KeyboardType.Number,
                                )
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(14.dp))

                    MessengerField(
                        modifier = Modifier.fillMaxWidth(),
                        value = name,
                        onValueChange = { name = it },
                        label = "Имя пользователя",
                        placeholder = "Введите ваше имя",
                    )

                    Spacer(modifier = Modifier.height(18.dp))

                    Button(
                        modifier = Modifier.fillMaxWidth(),
                        onClick = { onConnect(host, port, name) },
                        enabled = !connecting && name.trim().isNotEmpty(),
                        shape = RoundedCornerShape(18.dp),
                    ) {
                        if (connecting) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(18.dp),
                                strokeWidth = 2.dp,
                                color = TextPrimary,
                            )
                            Spacer(modifier = Modifier.width(10.dp))
                        }
                        Text(if (connecting) "Подключение..." else "Подключиться")
                    }

                    if (!error.isNullOrBlank()) {
                        Spacer(modifier = Modifier.height(14.dp))
                        Surface(
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(12.dp),
                            color = MaterialTheme.colorScheme.error.copy(alpha = 0.12f),
                        ) {
                            Text(
                                text = error,
                                modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp),
                                color = MaterialTheme.colorScheme.error,
                                fontSize = 13.sp,
                                lineHeight = 18.sp,
                            )
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.weight(1f))

            Text(
                text = "Проверка варианта 16: <@> level madam radar",
                color = TextMuted,
                fontSize = 12.sp,
                textAlign = TextAlign.Center,
                modifier = Modifier.widthIn(max = 520.dp),
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = "Эмулятор Android: 10.0.2.2, физическое устройство: IP компьютера в сети",
                color = TextMuted,
                fontSize = 11.sp,
                textAlign = TextAlign.Center,
                lineHeight = 16.sp,
                modifier = Modifier.widthIn(max = 520.dp),
            )
        }
    }
}

@Composable
private fun MessengerField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    placeholder: String,
    modifier: Modifier = Modifier,
    keyboardType: KeyboardType = KeyboardType.Text,
) {
    Column(modifier = modifier) {
        Text(
            text = label,
            color = TextSecondary,
            fontSize = 12.sp,
            fontWeight = FontWeight.SemiBold,
        )
        Spacer(modifier = Modifier.height(6.dp))
        OutlinedTextField(
            modifier = Modifier
                .fillMaxWidth()
                .height(56.dp),
            value = value,
            onValueChange = onValueChange,
            singleLine = true,
            shape = RoundedCornerShape(12.dp),
            textStyle = MaterialTheme.typography.bodyLarge.copy(
                color = TextPrimary,
            ),
            placeholder = {
                Text(
                    text = placeholder,
                    color = TextMuted,
                )
            },
            keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
            colors = OutlinedTextFieldDefaults.colors(
                focusedContainerColor = InputSurface,
                unfocusedContainerColor = InputSurface,
                focusedTextColor = TextPrimary,
                unfocusedTextColor = TextPrimary,
                disabledTextColor = TextPrimary,
                focusedBorderColor = Accent,
                unfocusedBorderColor = androidx.compose.ui.graphics.Color.Transparent,
                disabledBorderColor = androidx.compose.ui.graphics.Color.Transparent,
                cursorColor = Accent,
                focusedPlaceholderColor = TextMuted,
                unfocusedPlaceholderColor = TextMuted,
                focusedLabelColor = TextSecondary,
                unfocusedLabelColor = TextSecondary,
            ),
        )
    }
}
