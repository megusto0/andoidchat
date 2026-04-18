package com.megusto.tcpmessenger.android.data

import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject
import java.util.Locale

object MessengerProtocol {
    fun buildLoginCommand(
        name: String,
        platform: ClientPlatform = ClientPlatform.ANDROID,
    ): String = "LOGIN|" + JSONObject()
        .put("name", name)
        .put("platform", platform.toProtocolValue())
        .toString()

    fun buildListCommand(): String = "LIST|"

    fun buildQuitCommand(): String = "QUIT|"

    fun buildMessageCommand(
        text: String,
        mode: GroupMode,
        targets: List<String>,
    ): String {
        val payload = JSONObject()
            .put("mode", mode.toProtocolValue())
            .put("targets", JSONArray(targets))
            .put("content", text)

        return "MESSAGE|$payload"
    }

    fun parseServerLine(line: String): ServerEvent {
        val separatorIndex = line.indexOf('|')
        val command = if (separatorIndex == -1) line.trim() else line.substring(0, separatorIndex).trim()
        val payload = if (separatorIndex == -1) "" else line.substring(separatorIndex + 1)

        return when (command.uppercase(Locale.ROOT)) {
            "LOGIN_OK" -> ServerEvent.LoginOk(payload)
            "INFO" -> ServerEvent.Info(decodeEscapedText(payload))
            "ERROR" -> ServerEvent.Error(decodeEscapedText(payload))
            "CLIENTS" -> ServerEvent.Clients(
                payload.split(',')
                    .map { it.trim() }
                    .filter { it.isNotEmpty() },
            )
            "CLIENTS_META" -> ServerEvent.ClientPlatforms(parseClientPlatforms(payload))
            "SYNC_HISTORY" -> ServerEvent.SyncHistory(parseHistoryMessages(payload))
            "MESSAGE" -> parseMessagePayload(payload)
            else -> ServerEvent.Info("$command|$payload")
        }
    }

    private fun parseClientPlatforms(payload: String): Map<String, ClientPlatform> {
        return try {
            val parsed = JSONObject(payload)
            buildMap {
                val keys = parsed.keys()
                while (keys.hasNext()) {
                    val name = keys.next()
                    val platform = ClientPlatform.fromProtocolValue(parsed.optString(name))
                    if (name.isNotBlank()) {
                        put(name, platform)
                    }
                }
            }
        } catch (_: JSONException) {
            emptyMap()
        }
    }

    private fun parseMessagePayload(payload: String): ServerEvent.Message {
        try {
            val parsed = JSONObject(payload)
            val sender = parsed.optString("sender")
            val content = parsed.optString("content")

            if (sender.isNotBlank() && content.isNotBlank()) {
                val targets = buildList {
                    val rawTargets = parsed.optJSONArray("targets") ?: JSONArray()
                    for (index in 0 until rawTargets.length()) {
                        val value = rawTargets.optString(index)
                        if (value.isNotBlank()) {
                            add(value)
                        }
                    }
                }

                return ServerEvent.Message(
                    sender = sender,
                    text = content,
                    mode = GroupMode.fromProtocolValue(parsed.optString("mode")),
                    targets = targets,
                    timestampMillis = parsed.optLong("timestamp", System.currentTimeMillis()),
                    simulationId = parsed.optString("simulationId").takeIf { it.isNotBlank() },
                )
            }
        } catch (_: JSONException) {
            // Legacy fallback below.
        }

        val pipeIndex = payload.indexOf('|')
        return if (pipeIndex == -1) {
            ServerEvent.Message(
                sender = "Неизвестно",
                text = decodeEscapedText(payload),
                mode = GroupMode.ALL,
                targets = emptyList(),
                timestampMillis = System.currentTimeMillis(),
                simulationId = null,
            )
        } else {
            ServerEvent.Message(
                sender = payload.substring(0, pipeIndex),
                text = decodeEscapedText(payload.substring(pipeIndex + 1)),
                mode = GroupMode.ALL,
                targets = emptyList(),
                timestampMillis = System.currentTimeMillis(),
                simulationId = null,
            )
        }
    }

    private fun parseHistoryMessages(payload: String): List<HistoryMessage> {
        return try {
            val root = JSONObject(payload)
            val rawMessages = root.optJSONArray("messages") ?: JSONArray()
            buildList {
                for (index in 0 until rawMessages.length()) {
                    val raw = rawMessages.optJSONObject(index) ?: continue
                    val sender = raw.optString("sender")
                    val text = raw.optString("content")
                    if (sender.isBlank() || text.isBlank()) continue

                    val targets = buildList {
                        val rawTargets = raw.optJSONArray("targets") ?: JSONArray()
                        for (targetIndex in 0 until rawTargets.length()) {
                            val value = rawTargets.optString(targetIndex)
                            if (value.isNotBlank()) {
                                add(value)
                            }
                        }
                    }

                    add(
                        HistoryMessage(
                            sender = sender,
                            text = text,
                            mode = GroupMode.fromProtocolValue(raw.optString("mode")),
                            targets = targets,
                            timestampMillis = raw.optLong("timestamp", System.currentTimeMillis()),
                        ),
                    )
                }
            }
        } catch (_: JSONException) {
            emptyList()
        }
    }

    private fun decodeEscapedText(raw: String): String {
        val result = StringBuilder()
        var escaped = false

        raw.forEach { ch ->
            if (!escaped) {
                if (ch == '\\') {
                    escaped = true
                } else {
                    result.append(ch)
                }
                return@forEach
            }

            when (ch) {
                'n' -> result.append('\n')
                '\\' -> result.append('\\')
                else -> {
                    result.append('\\')
                    result.append(ch)
                }
            }
            escaped = false
        }

        if (escaped) {
            result.append('\\')
        }

        return result.toString()
    }
}
