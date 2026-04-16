package com.megusto.tcpmessenger.android

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import com.megusto.tcpmessenger.android.ui.MessengerApp
import com.megusto.tcpmessenger.android.ui.theme.AppBackground
import com.megusto.tcpmessenger.android.ui.theme.TcpMessengerTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        setContent {
            TcpMessengerTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = AppBackground,
                ) {
                    MessengerApp()
                }
            }
        }
    }
}
