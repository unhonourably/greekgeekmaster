package official.greekgeek.services

object AppConfig {
    const val SUPABASE_URL = "https://tudoxaxqbbptqfabebrf.supabase.co"
    const val SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR1ZG94YXhxYmJwdHFmYWJlYnJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI1MzcxNDYsImV4cCI6MjEwODExMzE0Nn0.ke7Yd_6sIJrLT6HcmLNyVDJ3xTPohMgJGj2GZcvMWso"
    const val APP_URL = "https://greekgeek.org"
    const val BRAND_NAME = "GreekGeek"
    const val LEGAL_NAME = "GreekGeek Software"
    const val TAGLINE = "Dues, members, and operations for Greek organizations."
    const val SUPPORT_EMAIL = "amare@greekgeek.org"

    fun chapterWebURL(slug: String, path: String = ""): String {
        return "$APP_URL/c/$slug$path"
    }
}
