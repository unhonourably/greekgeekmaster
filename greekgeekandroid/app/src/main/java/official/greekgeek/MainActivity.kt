package official.greekgeek

import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import official.greekgeek.services.DeviceNotifications
import official.greekgeek.state.AppSession
import official.greekgeek.theme.GreekGeekTheme

class MainActivity : ComponentActivity() {
    private val session: AppSession by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        DeviceNotifications.createNotificationChannel(this)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(arrayOf(android.Manifest.permission.POST_NOTIFICATIONS), 1001)
            }
        }

        session.initNotifications(this)

        handleIntentUri(intent?.data)

        setContent {
            GreekGeekTheme {
                GreekGeekApp(session = session)
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleIntentUri(intent.data)
    }

    private fun handleIntentUri(uri: Uri?) {
        if (uri == null) return
        val path = uri.path ?: ""
        if (path.contains("/invite/")) {
            session.pendingInviteToken = uri.lastPathSegment
        }
        val tokenHash = uri.getQueryParameter("token_hash")
        val type = uri.getQueryParameter("type")
        if (type == "recovery") {
            session.pendingResetPassword = true
        }
    }
}
