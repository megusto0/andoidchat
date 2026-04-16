package com.megusto.tcpmessenger.android.data

import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject
import java.util.Locale

object MessengerProtocol {
    fun buildLoginCommand(name: String): String = "LOGIN|$name"

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
            "MESSAGE" -> parseMessagePayload(payload)
            else -> ServerEvent.Info("$command|$payload")
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
            )
        } else {
            ServerEvent.Message(
                sender = payload.substring(0, pipeIndex),
                text = decodeEscapedText(payload.substring(pipeIndex + 1)),
                mode = GroupMode.ALL,
                targets = emptyList(),
            )
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
