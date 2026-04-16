package com.megusto.tcpmessenger.android.data

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import java.io.BufferedReader
import java.io.BufferedWriter
import java.io.IOException
import java.net.InetSocketAddress
import java.net.Socket

class TcpMessengerClient(
    private val scope: CoroutineScope,
) {
    private data class Connection(
        val socket: Socket,
        val reader: BufferedReader,
        val writer: BufferedWriter,
    )

    private var connection: Connection? = null
    private var readJob: Job? = null
    private var listPollJob: Job? = null
    private val writeMutex = Mutex()

    @Volatile
    private var userInitiatedDisconnect = false

    private val _events = kotlinx.coroutines.flow.MutableSharedFlow<ServerEvent>(
        extraBufferCapacity = 64,
    )
    val events = _events.asSharedFlow()

    suspend fun connect(
        host: String,
        port: Int,
        name: String,
    ) {
        disconnectSilently()
        userInitiatedDisconnect = false

        val socket = withContext(Dispatchers.IO) {
            Socket().apply {
                tcpNoDelay = true
                connect(InetSocketAddress(host, port), 5_000)
            }
        }
        val reader = socket.getInputStream().bufferedReader(Charsets.UTF_8)
        val writer = socket.getOutputStream().bufferedWriter(Charsets.UTF_8)
        connection = Connection(socket, reader, writer)

        try {
            writeLine(MessengerProtocol.buildLoginCommand(name))
            val loginLine = withContext(Dispatchers.IO) { reader.readLine() }
                ?: throw IOException("Сервер закрыл соединение во время входа.")
            when (val event = MessengerProtocol.parseServerLine(loginLine)) {
                is ServerEvent.LoginOk -> Unit
                is ServerEvent.Error -> throw IOException(event.text)
                else -> throw IOException("Некорректный ответ сервера: $loginLine")
            }
            startReadLoop()
            startClientPolling()
            requestClientList()
        } catch (t: Throwable) {
            disconnectSilently()
            throw t
        }
    }

    suspend fun sendMessage(
        text: String,
        mode: GroupMode,
        targets: List<String>,
    ) {
        writeLine(MessengerProtocol.buildMessageCommand(text, mode, targets))
    }

    suspend fun sendRaw(raw: String) {
        writeLine(raw)
    }

    suspend fun requestClientList() {
        writeLine(MessengerProtocol.buildListCommand())
    }

    suspend fun disconnect() {
        userInitiatedDisconnect = true
        listPollJob?.cancel()
        listPollJob = null
        runCatching { writeLine(MessengerProtocol.buildQuitCommand()) }
        readJob?.cancel()
        readJob = null
        closeConnection()
    }

    fun dispose() {
        userInitiatedDisconnect = true
        readJob?.cancel()
        listPollJob?.cancel()
        readJob = null
        listPollJob = null
        val current = connection
        connection = null

        if (current != null) {
            runCatching { current.writer.close() }
            runCatching { current.reader.close() }
            runCatching { current.socket.close() }
        }
    }

    private suspend fun disconnectSilently() {
        userInitiatedDisconnect = true
        listPollJob?.cancel()
        listPollJob = null
        readJob?.cancel()
        readJob = null
        closeConnection()
    }

    private fun startReadLoop() {
        readJob?.cancel()
        readJob = scope.launch(Dispatchers.IO) {
            try {
                while (isActive) {
                    val reader = connection?.reader ?: break
                    val line = reader.readLine() ?: break
                    _events.emit(MessengerProtocol.parseServerLine(line))
                }
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (_: IOException) {
                // Socket closed or dropped.
            } finally {
                val shouldNotify = !userInitiatedDisconnect
                closeConnection()
                if (shouldNotify) {
                    _events.emit(ServerEvent.Disconnected)
                }
            }
        }
    }

    private fun startClientPolling() {
        listPollJob?.cancel()
        listPollJob = scope.launch {
            while (isActive) {
                delay(1_200)
                runCatching { requestClientList() }
            }
        }
    }

    private suspend fun writeLine(text: String) {
        writeMutex.withLock {
            val writer = connection?.writer ?: throw IOException("Не подключено.")
            withContext(Dispatchers.IO) {
                writer.write(text)
                writer.newLine()
                writer.flush()
            }
        }
    }

    private suspend fun closeConnection() {
        val current = connection ?: return
        connection = null
        withContext(Dispatchers.IO) {
            runCatching { current.writer.close() }
            runCatching { current.reader.close() }
            runCatching { current.socket.close() }
        }
    }
}
