package official.greekgeek

import androidx.compose.animation.Crossfade
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import official.greekgeek.design.WordmarkView
import official.greekgeek.features.auth.ResetPasswordModal
import official.greekgeek.features.home.SignedInRootView
import official.greekgeek.features.marketing.MarketingHomeView
import official.greekgeek.state.AppFlow
import official.greekgeek.state.AppSession
import official.greekgeek.theme.Palette

@Composable
fun GreekGeekApp(session: AppSession) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Palette.canvas)
    ) {
        Crossfade(
            targetState = session.isRestoring to session.flow,
            animationSpec = tween(200),
            label = "AppFlowTransition"
        ) { (restoring, flow) ->
            if (restoring) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(Palette.canvas),
                    contentAlignment = Alignment.Center
                ) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(16.dp)
                    ) {
                        WordmarkView(height = 24.dp)
                        CircularProgressIndicator(
                            color = Palette.accent,
                            modifier = Modifier.size(24.dp),
                            strokeWidth = 2.dp
                        )
                    }
                }
            } else {
                when (flow) {
                    AppFlow.SIGNED_IN -> SignedInRootView(session = session)
                    AppFlow.MARKETING -> MarketingHomeView(session = session)
                }
            }
        }

        if (session.pendingResetPassword) {
            ResetPasswordModal(
                session = session,
                onDismiss = { session.pendingResetPassword = false }
            )
        }
    }
}
