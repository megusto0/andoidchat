package com.megusto.tcpmessenger.android.data

import android.content.Context
import android.net.wifi.WifiManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.NetworkInterface
import java.net.SocketTimeoutException
import java.util.Collections
import kotlin.math.max

data class DiscoveredServer(
    val host: String,
    val port: Int,
)

object ServerDiscovery {
    private const val discoveryPort = 54545
    private const val discoveryRequest = "TCP_MESSENGER_DISCOVER_V1"
    private const val discoveryApp = "tcp-messenger"

    suspend fun discover(
        context: Context,
        timeoutMs: Int = 1_500,
    ): DiscoveredServer? = withContext(Dispatchers.IO) {
        val socket = DatagramSocket().apply {
            broadcast = true
            soTimeout = 250
        }
        val multicastLock = createMulticastLock(context)

        try {
            multicastLock?.acquire()
            val requestBytes = discoveryRequest.toByteArray(Charsets.UTF_8)
            val targets = linkedSetOf(
                "255.255.255.255",
                "10.0.2.2",
                "127.0.0.1",
            )
            targets += interfaceBroadcastAddresses()

            targets.forEach { host ->
                runCatching {
                    socket.send(
                        DatagramPacket(
                            requestBytes,
                            requestBytes.size,
                            InetAddress.getByName(host),
                            discoveryPort,
                        ),
                    )
                }
            }

            val deadline = System.currentTimeMillis() + timeoutMs.coerceAtLeast(250)
            val buffer = ByteArray(1024)

            while (System.currentTimeMillis() < deadline) {
                val remaining = (deadline - System.currentTimeMillis()).toInt()
                socket.soTimeout = max(100, remaining.coerceAtMost(250))

                val packet = DatagramPacket(buffer, buffer.size)
                try {
                    socket.receive(packet)
                } catch (_: SocketTimeoutException) {
                    continue
                }

                val payload = runCatching {
                    String(packet.data, 0, packet.length, Charsets.UTF_8).trim()
                }.getOrNull() ?: continue

                val responseHost = packet.address?.hostAddress ?: continue
                parseResponse(payload, responseHost)?.let { return@withContext it }
            }

            null
        } finally {
            runCatching {
                if (multicastLock?.isHeld == true) {
                    multicastLock.release()
                }
            }
            socket.close()
        }
    }

    private fun createMulticastLock(context: Context): WifiManager.MulticastLock? {
        val wifiManager = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
            ?: return null
        return wifiManager.createMulticastLock("tcp-messenger-discovery").apply {
            setReferenceCounted(false)
        }
    }

    private fun interfaceBroadcastAddresses(): Set<String> {
        val broadcasts = linkedSetOf<String>()
        val interfaces = runCatching {
            Collections.list(NetworkInterface.getNetworkInterfaces())
        }.getOrDefault(emptyList())

        interfaces
            .asSequence()
            .filter { iface ->
                runCatching { iface.isUp && !iface.isLoopback }.getOrDefault(false)
            }
            .forEach { iface ->
                iface.interfaceAddresses.forEach { address ->
                    val broadcast = address.broadcast?.hostAddress
                    if (broadcast != null) {
                        broadcasts += broadcast
                    }
                }
            }

        return broadcasts
    }

    private fun parseResponse(payload: String, fallbackHost: String): DiscoveredServer? {
        return runCatching {
            val parsed = JSONObject(payload)
            if (parsed.optString("app") != discoveryApp) {
                return null
            }

            val port = parsed.optInt("tcp_port", -1)
            if (port !in 1..65_535) {
                return null
            }

            DiscoveredServer(
                host = fallbackHost,
                port = port,
            )
        }.getOrNull()
    }
}
