package official.greekgeek.design

import java.text.NumberFormat
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import kotlin.math.abs
import kotlin.math.roundToInt

object MoneyFormat {
    fun cents(cents: Int, currency: String = "usd"): String = cents(cents.toLong(), currency)

    fun cents(cents: Long, currency: String = "usd"): String {
        val value = abs(cents.toDouble()) / 100.0
        val formatter = NumberFormat.getCurrencyInstance(Locale.US)
        formatter.currency = java.util.Currency.getInstance(currency.uppercase())
        val formatted = formatter.format(value)
        return if (cents < 0) "−$formatted" else formatted
    }

    fun dollarsToCents(raw: String): Int? {
        val cleaned = raw.replace(Regex("""[$,\s]"""), "")
        if (!cleaned.matches(Regex("""^\d{1,7}(\.\d{0,2})?$"""))) return null
        val parts = cleaned.split(".")
        val whole = parts.getOrNull(0)?.toIntOrNull() ?: 0
        val fractionPart = (parts.getOrNull(1) ?: "").padEnd(2, '0').take(2)
        val fraction = fractionPart.toIntOrNull() ?: 0
        return whole * 100 + fraction
    }
}

object PlatformFees {
    fun platformFee(amountCents: Int, bps: Int, fixedCents: Int = 0, minCents: Int? = null, maxCents: Int? = null): Int {
        if (amountCents <= 0) return 0
        var fee = (amountCents * bps + 5_000) / 10_000 + fixedCents
        if (minCents != null) fee = maxOf(fee, minCents)
        if (maxCents != null) fee = minOf(fee, maxCents)
        return minOf(fee, amountCents)
    }

    fun processingFee(amountCents: Int, method: String): Int {
        if (amountCents <= 0) return 0
        if (method == "us_bank_account") {
            return minOf((amountCents * 80 + 5_000) / 10_000, 500)
        }
        return (amountCents * 290 + 5_000) / 10_000 + 30
    }

    fun percentLabel(bps: Int): String {
        val value = bps.toDouble() / 100.0
        return if (value == value.roundToInt().toDouble()) {
            "${value.toInt()}%"
        } else {
            "$value%"
        }
    }
}

object DateFormat {
    fun clock(date: Date): String {
        val sdf = SimpleDateFormat("h:mm a", Locale.US)
        return sdf.format(date)
    }

    fun medium(date: Date): String {
        val sdf = SimpleDateFormat("MMM d, yyyy", Locale.US)
        return sdf.format(date)
    }

    fun shortDay(date: Date): String {
        val sdf = SimpleDateFormat("MMM d", Locale.US)
        return sdf.format(date)
    }

    fun chapter(date: Date, timeZone: String): String {
        val sdf = SimpleDateFormat("EEE, MMM d, h:mm a z", Locale.US)
        sdf.timeZone = TimeZone.getTimeZone(timeZone)
        return sdf.format(date)
    }

    fun relative(date: Date, now: Date = Date()): String {
        val seconds = (now.time - date.time) / 1000
        return when {
            seconds < 60 -> "just now"
            seconds < 3600 -> "${seconds / 60}m ago"
            seconds < 86400 -> "${seconds / 3600}h ago"
            seconds < 604800 -> "${seconds / 86400}d ago"
            else -> medium(date)
        }
    }

    fun compactDuration(minutes: Int): String {
        if (minutes < 60) return "${minutes}m"
        val hours = (minutes / 60.0).roundToInt()
        if (hours < 48) return "${hours}h"
        return "${(hours / 24.0).roundToInt()}d"
    }

    fun month(date: Date, timeZone: String): String {
        val sdf = SimpleDateFormat("MMM", Locale.US)
        sdf.timeZone = TimeZone.getTimeZone(timeZone)
        return sdf.format(date)
    }

    fun day(date: Date, timeZone: String): String {
        val sdf = SimpleDateFormat("d", Locale.US)
        sdf.timeZone = TimeZone.getTimeZone(timeZone)
        return sdf.format(date)
    }

    fun weekdayTime(date: Date, timeZone: String): String {
        val sdf = SimpleDateFormat("EEE, h:mm a", Locale.US)
        sdf.timeZone = TimeZone.getTimeZone(timeZone)
        return sdf.format(date)
    }
}

object ISODate {
    fun parse(raw: String): Date? {
        if (raw.isBlank()) return null
        try {
            return Date.from(java.time.Instant.parse(raw))
        } catch (_: Exception) {}
        try {
            return Date.from(java.time.OffsetDateTime.parse(raw).toInstant())
        } catch (_: Exception) {}
        try {
            return Date.from(java.time.ZonedDateTime.parse(raw).toInstant())
        } catch (_: Exception) {}
        try {
            return Date.from(java.time.LocalDate.parse(raw).atStartOfDay(java.time.ZoneOffset.UTC).toInstant())
        } catch (_: Exception) {}
        val formats = arrayOf(
            "yyyy-MM-dd'T'HH:mm:ss.SSSX",
            "yyyy-MM-dd'T'HH:mm:ssX",
            "yyyy-MM-dd'T'HH:mm:ss",
            "yyyy-MM-dd"
        )
        for (pattern in formats) {
            try {
                val sdf = SimpleDateFormat(pattern, Locale.US)
                sdf.timeZone = TimeZone.getTimeZone("UTC")
                return sdf.parse(raw)
            } catch (_: Exception) {}
        }
        return null
    }

    fun timestamp(date: Date = Date()): String {
        val sdf = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US)
        sdf.timeZone = TimeZone.getTimeZone("UTC")
        return sdf.format(date)
    }

    fun format(date: Date = Date()): String = timestamp(date)

    fun day(date: Date = Date()): String {
        val sdf = SimpleDateFormat("yyyy-MM-dd", Locale.US)
        return sdf.format(date)
    }
}
