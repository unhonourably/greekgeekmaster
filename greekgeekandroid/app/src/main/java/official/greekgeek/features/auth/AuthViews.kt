package official.greekgeek.features.auth

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import official.greekgeek.design.*
import official.greekgeek.state.AppSession
import official.greekgeek.theme.Palette
import official.greekgeek.models.Tone

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LoginModal(
    session: AppSession,
    onDismiss: () -> Unit,
    onSwitchToSignUp: () -> Unit,
    onForgotPassword: () -> Unit
) {
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var errorText by remember { mutableStateOf<String?>(null) }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = Palette.surface
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 24.dp)
                .padding(bottom = 36.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            GGPageHeader(
                title = "Sign in",
                description = "Enter your school email and password to access your chapter."
            )

            if (errorText != null) {
                GGNotice(message = errorText!!, tone = Tone.DANGER)
            }

            GGField(label = "School email", hint = "e.g. jordan@state.edu") {
                GGTextField(
                    value = email,
                    onValueChange = {
                        email = it
                        errorText = null
                    },
                    placeholder = "name@school.edu",
                    keyboardType = KeyboardType.Email
                )
            }

            GGField(label = "Password") {
                GGSecureField(
                    value = password,
                    onValueChange = {
                        password = it
                        errorText = null
                    },
                    placeholder = "••••••••"
                )
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.End
            ) {
                Text(
                    text = "Forgot password?",
                    fontSize = 13.sp,
                    color = Palette.ink3,
                    modifier = Modifier.clickable { onForgotPassword() }
                )
            }

            GGButton(
                title = "Sign in",
                fillWidth = true,
                busy = busy
            ) {
                if (email.isBlank() || password.isBlank()) {
                    errorText = "Please enter both email and password."
                    return@GGButton
                }
                busy = true
                session.signIn(email, password) { success ->
                    busy = false
                    if (success) {
                        onDismiss()
                    } else {
                        errorText = session.lastError ?: "Could not sign in"
                    }
                }
            }



            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 8.dp),
                horizontalArrangement = Arrangement.Center
            ) {
                Text(
                    text = "Don't have an account? ",
                    fontSize = 13.sp,
                    color = Palette.ink3
                )
                Text(
                    text = "Register",
                    fontSize = 13.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = Palette.accent,
                    modifier = Modifier.clickable { onSwitchToSignUp() }
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SignUpModal(
    session: AppSession,
    onDismiss: () -> Unit,
    onSwitchToLogin: () -> Unit
) {
    var fullName by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var errorText by remember { mutableStateOf<String?>(null) }
    var noticeText by remember { mutableStateOf<String?>(null) }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = Palette.surface
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 24.dp)
                .padding(bottom = 36.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            GGPageHeader(
                title = "Create account",
                description = "Register to start a new chapter or accept an invitation."
            )

            if (noticeText != null) {
                GGNotice(message = noticeText!!, tone = Tone.POSITIVE)
            }
            if (errorText != null) {
                GGNotice(message = errorText!!, tone = Tone.DANGER)
            }

            GGField(label = "Full name") {
                GGTextField(
                    value = fullName,
                    onValueChange = { fullName = it },
                    placeholder = "Jordan Lee"
                )
            }

            GGField(label = "School email", hint = "Use your official university address if possible.") {
                GGTextField(
                    value = email,
                    onValueChange = { email = it },
                    placeholder = "jordan@state.edu",
                    keyboardType = KeyboardType.Email
                )
            }

            GGField(label = "Password", hint = "At least 8 characters.") {
                GGSecureField(
                    value = password,
                    onValueChange = { password = it },
                    placeholder = "••••••••"
                )
            }

            GGButton(
                title = "Create account",
                fillWidth = true,
                busy = busy
            ) {
                if (fullName.isBlank() || email.isBlank() || password.length < 6) {
                    errorText = "Please fill in all fields (password min 6 chars)."
                    return@GGButton
                }
                busy = true
                session.signUp(fullName, email, password) { result ->
                    busy = false
                    if (result == null) {
                        onDismiss()
                    } else if (result.contains("Check your email")) {
                        noticeText = result
                    } else {
                        errorText = result
                    }
                }
            }

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 8.dp),
                horizontalArrangement = Arrangement.Center
            ) {
                Text(
                    text = "Already have an account? ",
                    fontSize = 13.sp,
                    color = Palette.ink3
                )
                Text(
                    text = "Sign in",
                    fontSize = 13.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = Palette.accent,
                    modifier = Modifier.clickable { onSwitchToLogin() }
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ForgotPasswordModal(
    session: AppSession,
    onDismiss: () -> Unit
) {
    var email by remember { mutableStateOf("") }
    var sent by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = Palette.surface
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 24.dp)
                .padding(bottom = 36.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            GGPageHeader(
                title = "Reset password",
                description = "We will send a reset code to your email address."
            )

            if (sent) {
                GGNotice(
                    tone = Tone.POSITIVE,
                    message = "If an account exists for $email, a reset link was sent. Please check your inbox and spam folder."
                )
                GGButton(title = "Done", fillWidth = true) { onDismiss() }
            } else {
                GGField(label = "Account email") {
                    GGTextField(
                        value = email,
                        onValueChange = { email = it },
                        placeholder = "you@school.edu",
                        keyboardType = KeyboardType.Email
                    )
                }

                GGButton(
                    title = "Send reset link",
                    fillWidth = true,
                    busy = busy
                ) {
                    if (email.isBlank()) return@GGButton
                    busy = true
                    session.requestPasswordReset(email) {
                        busy = false
                        sent = true
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ResetPasswordModal(
    session: AppSession,
    onDismiss: () -> Unit
) {
    var newPassword by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var errorText by remember { mutableStateOf<String?>(null) }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = Palette.surface
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 24.dp)
                .padding(bottom = 36.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            GGPageHeader(
                title = "Set new password",
                description = "Choose a secure password with at least 8 characters."
            )

            if (errorText != null) {
                GGNotice(message = errorText!!, tone = Tone.DANGER)
            }

            GGField(label = "New password") {
                GGSecureField(
                    value = newPassword,
                    onValueChange = { newPassword = it },
                    placeholder = "••••••••"
                )
            }

            GGButton(
                title = "Update password",
                fillWidth = true,
                busy = busy
            ) {
                if (newPassword.length < 6) {
                    errorText = "Password must be at least 6 characters."
                    return@GGButton
                }
                busy = true
                session.updatePassword(newPassword) { success ->
                    busy = false
                    if (success) onDismiss() else errorText = session.lastError
                }
            }
        }
    }
}
