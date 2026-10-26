package official.greekgeek.design

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.LruCache
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import official.greekgeek.R
import official.greekgeek.theme.Palette
import official.greekgeek.models.Tone
import official.greekgeek.services.AppConfig
import java.net.URLEncoder

enum class GGButtonKind {
    PRIMARY,
    SECONDARY,
    GHOST,
    DANGER
}

enum class GGButtonSize {
    SM,
    MD
}

@Composable
fun GGButton(
    title: String,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null,
    kind: GGButtonKind = GGButtonKind.PRIMARY,
    size: GGButtonSize = GGButtonSize.MD,
    fillWidth: Boolean = false,
    busy: Boolean = false,
    enabled: Boolean = true,
    action: () -> Unit
) {
    val height = if (size == GGButtonSize.SM) 34.dp else 44.dp
    val hPad = if (size == GGButtonSize.SM) 12.dp else 16.dp
    val fontSize = if (size == GGButtonSize.SM) 13.sp else 15.sp

    val foreground = when (kind) {
        GGButtonKind.PRIMARY -> Palette.onAccent
        GGButtonKind.SECONDARY, GGButtonKind.GHOST -> Palette.ink
        GGButtonKind.DANGER -> Palette.danger
    }

    val background = when (kind) {
        GGButtonKind.PRIMARY -> Palette.accent
        GGButtonKind.SECONDARY -> Palette.surface
        GGButtonKind.GHOST -> Color.Transparent
        GGButtonKind.DANGER -> Palette.dangerSoft
    }

    val shape = RoundedCornerShape(8.dp)

    Box(
        modifier = modifier
            .then(if (fillWidth) Modifier.fillMaxWidth() else Modifier)
            .height(height)
            .clip(shape)
            .background(background)
            .then(
                if (kind == GGButtonKind.SECONDARY || kind == GGButtonKind.GHOST) {
                    Modifier.border(1.dp, Palette.lineStrong, shape)
                } else Modifier
            )
            .clickable(enabled = enabled && !busy, onClick = action)
            .padding(horizontal = hPad),
        contentAlignment = Alignment.Center
    ) {
        if (busy) {
            CircularProgressIndicator(
                modifier = Modifier.size(16.dp),
                strokeWidth = 2.dp,
                color = foreground
            )
        } else {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Center
            ) {
                if (icon != null) {
                    Icon(
                        imageVector = icon,
                        contentDescription = null,
                        tint = foreground,
                        modifier = Modifier.size(16.dp)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                }
                Text(
                    text = title,
                    color = foreground,
                    fontSize = fontSize,
                    fontWeight = FontWeight.SemiBold
                )
            }
        }
    }
}

@Composable
fun GGBadge(
    text: String,
    modifier: Modifier = Modifier,
    tone: Tone = Tone.NEUTRAL
) {
    val shape = RoundedCornerShape(999.dp)
    Box(
        modifier = modifier
            .clip(shape)
            .background(tone.soft)
            .border(1.dp, tone.foreground.copy(alpha = 0.2f), shape)
            .padding(horizontal = 7.dp, vertical = 3.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = text,
            fontSize = 11.sp,
            fontWeight = FontWeight.SemiBold,
            color = tone.foreground
        )
    }
}

@Composable
fun GGNotice(
    message: String,
    modifier: Modifier = Modifier,
    tone: Tone = Tone.INFO,
    title: String? = null
) {
    val shape = RoundedCornerShape(8.dp)
    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(shape)
            .background(tone.soft)
            .border(1.dp, tone.foreground.copy(alpha = 0.25f), shape)
            .padding(14.dp)
    ) {
        if (title != null) {
            Text(
                text = title,
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
                color = Palette.ink
            )
            Spacer(modifier = Modifier.height(4.dp))
        }
        Text(
            text = message,
            fontSize = 13.sp,
            color = Palette.ink2
        )
    }
}

@Composable
fun GGCard(
    modifier: Modifier = Modifier,
    padding: Dp = 0.dp,
    content: @Composable ColumnScope.() -> Unit
) {
    val shape = RoundedCornerShape(8.dp)
    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(shape)
            .background(Palette.surface)
            .border(1.dp, Palette.line, shape)
            .padding(padding),
        content = content
    )
}

@Composable
fun GGCardHeader(
    title: String,
    modifier: Modifier = Modifier,
    description: String? = null,
    action: String? = null,
    actionHandler: (() -> Unit)? = null
) {
    Column(modifier = modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = title,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = Palette.ink
                )
                if (description != null) {
                    Spacer(modifier = Modifier.height(3.dp))
                    Text(
                        text = description,
                        fontSize = 13.sp,
                        color = Palette.ink3
                    )
                }
            }
            if (action != null && actionHandler != null) {
                Spacer(modifier = Modifier.width(12.dp))
                Text(
                    text = action,
                    fontSize = 13.sp,
                    color = Palette.ink3,
                    modifier = Modifier.clickable(onClick = actionHandler)
                )
            }
        }
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(1.dp)
                .background(Palette.line)
        )
    }
}

@Composable
fun GGPageHeader(
    title: String,
    modifier: Modifier = Modifier,
    description: String? = null,
    trailing: String? = null
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(bottom = 8.dp),
        verticalAlignment = Alignment.Top
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = title,
                fontSize = 24.sp,
                fontWeight = FontWeight.SemiBold,
                color = Palette.ink
            )
            if (description != null) {
                Spacer(modifier = Modifier.height(6.dp))
                Text(
                    text = description,
                    fontSize = 15.sp,
                    color = Palette.ink2
                )
            }
        }
        if (trailing != null) {
            Spacer(modifier = Modifier.width(8.dp))
            Text(
                text = trailing,
                fontSize = 26.sp,
                fontWeight = FontWeight.SemiBold,
                fontFamily = FontFamily.Serif,
                color = Palette.ink3
            )
        }
    }
}

@Composable
fun GGField(
    label: String,
    modifier: Modifier = Modifier,
    hint: String? = null,
    error: String? = null,
    content: @Composable () -> Unit
) {
    Column(modifier = modifier.fillMaxWidth()) {
        Text(
            text = label,
            fontSize = 13.sp,
            fontWeight = FontWeight.Medium,
            color = Palette.ink
        )
        Spacer(modifier = Modifier.height(6.dp))
        content()
        if (error != null) {
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = error,
                fontSize = 13.sp,
                color = Palette.danger
            )
        } else if (hint != null) {
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = hint,
                fontSize = 12.sp,
                color = Palette.ink3
            )
        }
    }
}

@Composable
fun GGTextField(
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    placeholder: String = "",
    keyboardType: KeyboardType = KeyboardType.Text,
    invalid: Boolean = false,
    singleLine: Boolean = true,
    keyboardActions: KeyboardActions = KeyboardActions.Default
) {
    val shape = RoundedCornerShape(8.dp)
    val borderColor = if (invalid) Palette.danger else Palette.lineStrong

    BasicTextField(
        value = value,
        onValueChange = onValueChange,
        modifier = modifier
            .fillMaxWidth()
            .height(44.dp)
            .clip(shape)
            .background(Palette.surface)
            .border(1.dp, borderColor, shape)
            .padding(horizontal = 14.dp),
        textStyle = TextStyle(
            fontSize = 15.sp,
            color = Palette.ink
        ),
        cursorBrush = SolidColor(Palette.accent),
        singleLine = singleLine,
        keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
        keyboardActions = keyboardActions,
        decorationBox = { innerTextField ->
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.CenterStart
            ) {
                if (value.isEmpty()) {
                    Text(
                        text = placeholder,
                        fontSize = 15.sp,
                        color = Palette.ink3
                    )
                }
                innerTextField()
            }
        }
    )
}

@Composable
fun GGSecureField(
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    placeholder: String = "",
    invalid: Boolean = false,
    keyboardActions: KeyboardActions = KeyboardActions.Default
) {
    var visible by remember { mutableStateOf(false) }
    val shape = RoundedCornerShape(8.dp)
    val borderColor = if (invalid) Palette.danger else Palette.lineStrong

    Row(
        modifier = modifier
            .fillMaxWidth()
            .height(44.dp)
            .clip(shape)
            .background(Palette.surface)
            .border(1.dp, borderColor, shape),
        verticalAlignment = Alignment.CenterVertically
    ) {
        BasicTextField(
            value = value,
            onValueChange = onValueChange,
            modifier = Modifier
                .weight(1f)
                .padding(start = 14.dp),
            textStyle = TextStyle(
                fontSize = 15.sp,
                color = Palette.ink
            ),
            cursorBrush = SolidColor(Palette.accent),
            singleLine = true,
            visualTransformation = if (visible) VisualTransformation.None else PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
            keyboardActions = keyboardActions,
            decorationBox = { innerTextField ->
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.CenterStart
                ) {
                    if (value.isEmpty()) {
                        Text(
                            text = placeholder,
                            fontSize = 15.sp,
                            color = Palette.ink3
                        )
                    }
                    innerTextField()
                }
            }
        )
        IconButton(
            onClick = { visible = !visible },
            modifier = Modifier.size(44.dp)
        ) {
            Icon(
                imageVector = if (visible) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                contentDescription = if (visible) "Hide password" else "Show password",
                tint = Palette.ink3,
                modifier = Modifier.size(20.dp)
            )
        }
    }
}

@Composable
fun GGTextArea(
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    placeholder: String = "",
    minHeight: Dp = 96.dp
) {
    val shape = RoundedCornerShape(8.dp)
    Box(
        modifier = modifier
            .fillMaxWidth()
            .heightIn(min = minHeight)
            .clip(shape)
            .background(Palette.surface)
            .border(1.dp, Palette.lineStrong, shape)
            .padding(horizontal = 14.dp, vertical = 10.dp)
    ) {
        if (value.isEmpty()) {
            Text(
                text = placeholder,
                fontSize = 14.sp,
                color = Palette.ink3
            )
        }
        BasicTextField(
            value = value,
            onValueChange = onValueChange,
            modifier = Modifier.fillMaxWidth(),
            textStyle = TextStyle(
                fontSize = 14.sp,
                color = Palette.ink
            ),
            cursorBrush = SolidColor(Palette.accent)
        )
    }
}

@Composable
fun GGScreenStack(
    modifier: Modifier = Modifier,
    content: @Composable ColumnScope.() -> Unit
) {
    val scrollState = rememberScrollState()
    Column(
        modifier = modifier
            .fillMaxSize()
            .background(Palette.canvas)
            .verticalScroll(scrollState)
            .padding(horizontal = 20.dp)
            .padding(top = 8.dp, bottom = 36.dp),
        verticalArrangement = Arrangement.spacedBy(18.dp),
        content = content
    )
}

@Composable
fun GGEmptyState(
    icon: ImageVector,
    title: String,
    modifier: Modifier = Modifier,
    message: String? = null
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(28.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = Palette.ink3,
            modifier = Modifier.size(26.dp)
        )
        Text(
            text = title,
            fontSize = 15.sp,
            fontWeight = FontWeight.SemiBold,
            color = Palette.ink,
            textAlign = TextAlign.Center
        )
        if (message != null) {
            Text(
                text = message,
                fontSize = 13.sp,
                color = Palette.ink3,
                textAlign = TextAlign.Center
            )
        }
    }
}

object AvatarURL {
    fun publicFile(path: String?): String? {
        if (path.isNullOrBlank()) return null
        val base = AppConfig.SUPABASE_URL.trimEnd('/')
        val encoded = path.split("/").joinToString("/") {
            try {
                URLEncoder.encode(it, "UTF-8").replace("+", "%20")
            } catch (_: Exception) {
                it
            }
        }
        return "$base/storage/v1/object/public/avatars/$encoded"
    }
}

object AvatarImageLoader {
    private val cache = LruCache<String, Bitmap>(60)
    private val client by lazy { OkHttpClient() }

    suspend fun loadBitmap(url: String): Bitmap? = withContext(Dispatchers.IO) {
        cache.get(url)?.let { return@withContext it }
        try {
            val req = Request.Builder().url(url).build()
            client.newCall(req).execute().use { response ->
                if (!response.isSuccessful) return@withContext null
                val bytes = response.body?.bytes() ?: return@withContext null
                val bmp = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
                if (bmp != null) {
                    cache.put(url, bmp)
                }
                bmp
            }
        } catch (_: Exception) {
            null
        }
    }
}

@Composable
fun PersonAvatar(
    name: String,
    modifier: Modifier = Modifier,
    path: String? = null,
    size: Dp = 36.dp
) {
    val initials = remember(name) {
        name.trim().split(" ")
            .filter { it.isNotEmpty() }
            .take(2)
            .mapNotNull { it.firstOrNull()?.toString() }
            .joinToString("")
            .uppercase()
    }

    val url = remember(path) { AvatarURL.publicFile(path) }
    var bitmap by remember(url) { mutableStateOf<Bitmap?>(null) }

    LaunchedEffect(url) {
        if (url != null) {
            bitmap = AvatarImageLoader.loadBitmap(url)
        } else {
            bitmap = null
        }
    }

    Box(
        modifier = modifier
            .size(size)
            .clip(CircleShape)
            .background(Palette.accentSoft),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = initials,
            fontSize = (size.value * 0.36f).sp,
            fontWeight = FontWeight.SemiBold,
            color = Palette.accent
        )
        val bmp = bitmap
        if (bmp != null) {
            Image(
                bitmap = bmp.asImageBitmap(),
                contentDescription = name,
                modifier = Modifier.fillMaxSize(),
                contentScale = ContentScale.Crop
            )
        }
    }
}

@Composable
fun WordmarkView(
    modifier: Modifier = Modifier,
    height: Dp = 22.dp
) {
    Image(
        painter = painterResource(id = R.drawable.wordmark),
        contentDescription = "GreekGeek",
        modifier = modifier.height(height),
        contentScale = ContentScale.FillHeight
    )
}

@Composable
fun SectionLabel(
    text: String,
    modifier: Modifier = Modifier
) {
    Text(
        text = text.uppercase(),
        fontSize = 11.sp,
        fontWeight = FontWeight.Medium,
        letterSpacing = 0.6.sp,
        color = Palette.ink3,
        modifier = modifier
    )
}

@Composable
fun ListRowDivider(
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(1.dp)
            .background(Palette.line)
    )
}

@Composable
fun GGDesktopHint(
    title: String = "Better on a computer",
    message: String = "This screen is built for a phone. Ledger exports, CSV downloads, and the full officer tools stay on the website.",
    modifier: Modifier = Modifier
) {
    Text(
        text = "There are more settings on the website at greekgeek.org",
        fontSize = 13.sp,
        color = Palette.ink3,
        modifier = modifier.fillMaxWidth()
    )
}
