package com.megusto.tcpmessenger.android.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable

private val MessengerDarkScheme = darkColorScheme(
    primary = Accent,
    onPrimary = TextPrimary,
    secondary = TextSecondary,
    onSecondary = TextPrimary,
    tertiary = InfoBlue,
    background = AppBackground,
    onBackground = TextPrimary,
    surface = MainSurface,
    onSurface = TextPrimary,
    surfaceVariant = ElevatedCard,
    onSurfaceVariant = TextSecondary,
    error = ErrorRed,
    onError = TextPrimary,
)

private val MessengerTypography = Typography()

@Composable
fun TcpMessengerTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = MessengerDarkScheme,
        typography = MessengerTypography,
        content = content,
    )
}
