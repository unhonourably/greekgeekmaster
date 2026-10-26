package official.greekgeek.theme

import android.app.Activity
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

private val DarkColorScheme = darkColorScheme(
    primary = Palette.accent,
    onPrimary = Palette.onAccent,
    primaryContainer = Palette.accentSoft,
    onPrimaryContainer = Palette.accent,
    secondary = Palette.gold,
    onSecondary = Palette.onAccent,
    background = Palette.canvas,
    onBackground = Palette.ink,
    surface = Palette.surface,
    onSurface = Palette.ink,
    surfaceVariant = Palette.subtle,
    onSurfaceVariant = Palette.ink2,
    outline = Palette.line,
    outlineVariant = Palette.lineStrong,
    error = Palette.danger,
    onError = Palette.onAccent,
    errorContainer = Palette.dangerSoft,
    onErrorContainer = Palette.danger
)

@Composable
fun GreekGeekTheme(
    content: @Composable () -> Unit
) {
    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as? Activity)?.window
            if (window != null) {
                window.statusBarColor = Palette.canvas.toArgb()
                window.navigationBarColor = Palette.canvas.toArgb()
                WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = false
                WindowCompat.getInsetsController(window, view).isAppearanceLightNavigationBars = false
            }
        }
    }

    MaterialTheme(
        colorScheme = DarkColorScheme,
        typography = Typography,
        content = content
    )
}
