package es.manico.chartintelligence.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AdminPanelSettings
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.PersonAdd
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import es.manico.chartintelligence.R
import es.manico.chartintelligence.data.repository.AdminUserDto
import es.manico.chartintelligence.ui.theme.JetBrainsMonoFontFamily
import es.manico.chartintelligence.ui.theme.LocalFinancialPalette

/**
 * Multi-User Admin Card for Android Settings (Account tab).
 * Visible only for `owner` and `admin` roles; all mutations are verified server-side by `admin_users.php`.
 */
@Composable
fun AdminUsersSectionCard(
    currentUsername: String,
    currentUserRole: String,
    users: List<AdminUserDto>,
    isLoading: Boolean,
    errorMessage: String?,
    onRefreshUsers: () -> Unit,
    onCreateUser: (username: String, email: String, password: String, role: String) -> Unit,
    onToggleUserActive: (userId: Long, nextActive: Boolean) -> Unit,
    onUpdateUserRole: (userId: Long, nextRole: String) -> Unit,
    onRevokeUserSessions: (userId: Long) -> Unit,
    onDeleteUser: (userId: Long) -> Unit,
    modifier: Modifier = Modifier
) {
    val cleanRole = currentUserRole.lowercase()
    if (cleanRole != "owner" && cleanRole != "admin") return

    val palette = LocalFinancialPalette.current
    var newUsername by rememberSaveable { mutableStateOf("") }
    var newEmail by rememberSaveable { mutableStateOf("") }
    var newPassword by rememberSaveable { mutableStateOf("") }
    var newRole by rememberSaveable { mutableStateOf("viewer") }

    Card(
        modifier = modifier
            .fillMaxWidth()
            .testTag("settings_admin_users_card"),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, palette.cardBorder)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.weight(1f)
                ) {
                    Icon(
                        imageVector = Icons.Outlined.AdminPanelSettings,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(20.dp)
                    )
                    Column {
                        Text(
                            text = stringResource(R.string.admin_users_title),
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.Bold
                        )
                        Text(
                            text = "${stringResource(R.string.admin_users_your_role)}: ${cleanRole.uppercase()}",
                            style = MaterialTheme.typography.labelSmall,
                            fontFamily = JetBrainsMonoFontFamily,
                            color = MaterialTheme.colorScheme.primary
                        )
                    }
                }
                IconButton(
                    onClick = onRefreshUsers,
                    modifier = Modifier
                        .minimumInteractiveComponentSize()
                        .testTag("admin_users_refresh_button")
                ) {
                    Icon(
                        imageVector = Icons.Outlined.Refresh,
                        contentDescription = stringResource(R.string.admin_users_refresh)
                    )
                }
            }

            if (!errorMessage.isNullOrBlank()) {
                Surface(
                    shape = RoundedCornerShape(8.dp),
                    color = MaterialTheme.colorScheme.errorContainer,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(
                        text = errorMessage,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onErrorContainer,
                        modifier = Modifier.padding(8.dp)
                    )
                }
            }

            // Create User Form
            CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                OutlinedTextField(
                    value = newUsername,
                    onValueChange = { newUsername = it },
                    label = { Text(stringResource(R.string.admin_users_new_username)) },
                    singleLine = true,
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("admin_create_username_input")
                )
                OutlinedTextField(
                    value = newEmail,
                    onValueChange = { newEmail = it },
                    label = { Text(stringResource(R.string.admin_users_new_email)) },
                    singleLine = true,
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("admin_create_email_input")
                )
                OutlinedTextField(
                    value = newPassword,
                    onValueChange = { newPassword = it },
                    label = { Text(stringResource(R.string.admin_users_new_password)) },
                    singleLine = true,
                    visualTransformation = PasswordVisualTransformation(),
                    modifier = Modifier
                        .fillMaxWidth()
                        .testTag("admin_create_password_input")
                )
            }

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                FilterChip(
                    selected = newRole == "viewer",
                    onClick = { newRole = "viewer" },
                    label = { Text("VIEWER", fontFamily = JetBrainsMonoFontFamily, style = MaterialTheme.typography.labelSmall) },
                    modifier = Modifier.testTag("admin_create_role_viewer")
                )
                if (cleanRole == "owner") {
                    FilterChip(
                        selected = newRole == "admin",
                        onClick = { newRole = "admin" },
                        label = { Text("ADMIN", fontFamily = JetBrainsMonoFontFamily, style = MaterialTheme.typography.labelSmall) },
                        modifier = Modifier.testTag("admin_create_role_admin")
                    )
                }
            }

            Button(
                onClick = {
                    val u = newUsername.trim()
                    if (u.length >= 3 && newPassword.length >= 8) {
                        onCreateUser(u, newEmail.trim(), newPassword, newRole)
                        newUsername = ""
                        newEmail = ""
                        newPassword = ""
                    }
                },
                enabled = newUsername.trim().length >= 3 && newPassword.length >= 8 && !isLoading,
                shape = RoundedCornerShape(8.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 48.dp)
                    .testTag("admin_create_user_submit")
            ) {
                Icon(Icons.Outlined.PersonAdd, contentDescription = null, modifier = Modifier.size(16.dp))
                Spacer(modifier = Modifier.width(6.dp))
                Text(stringResource(R.string.admin_users_create_button))
            }

            HorizontalDivider(color = palette.cardBorder)

            if (isLoading) {
                Text(
                    text = stringResource(R.string.admin_users_loading),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            } else if (users.isEmpty()) {
                Text(
                    text = stringResource(R.string.admin_users_empty_hint),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            } else {
                users.forEach { user ->
                    val isOwnerRow = user.role.equals("owner", ignoreCase = true)
                    val isSelf = user.username.equals(currentUsername, ignoreCase = true)
                    val canManage = !isOwnerRow && !isSelf && (cleanRole == "owner" || user.role.equals("viewer", ignoreCase = true))

                    Surface(
                        shape = RoundedCornerShape(10.dp),
                        color = MaterialTheme.colorScheme.surfaceContainerLow,
                        border = BorderStroke(1.dp, palette.cardBorder),
                        modifier = Modifier
                            .fillMaxWidth()
                            .testTag("admin_user_row_${user.id}")
                    ) {
                        Column(
                            modifier = Modifier.padding(10.dp),
                            verticalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = "${user.username} (${user.role.uppercase()})",
                                        style = MaterialTheme.typography.bodySmall,
                                        fontFamily = JetBrainsMonoFontFamily,
                                        fontWeight = FontWeight.Bold,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                    Text(
                                        text = "${user.email.ifBlank { "—" }} · ${if (user.isActive) "ACTIVE" else "DISABLED"} · ${user.activeSessions} sess",
                                        style = MaterialTheme.typography.labelSmall,
                                        fontFamily = JetBrainsMonoFontFamily,
                                        color = if (user.isActive) palette.bullCandle else palette.bearCandle,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                }
                            }
                            if (canManage) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    if (cleanRole == "owner") {
                                        val nextRole = if (user.role.equals("admin", ignoreCase = true)) "viewer" else "admin"
                                        OutlinedButton(
                                            onClick = { onUpdateUserRole(user.id, nextRole) },
                                            contentPadding = PaddingValues(horizontal = 8.dp, vertical = 2.dp),
                                            modifier = Modifier.height(36.dp)
                                        ) {
                                            Text(nextRole.uppercase(), style = MaterialTheme.typography.labelSmall)
                                        }
                                    }
                                    OutlinedButton(
                                        onClick = { onToggleUserActive(user.id, !user.isActive) },
                                        contentPadding = PaddingValues(horizontal = 8.dp, vertical = 2.dp),
                                        modifier = Modifier.height(36.dp)
                                    ) {
                                        Text(
                                            text = stringResource(if (user.isActive) R.string.admin_users_disable else R.string.admin_users_enable),
                                            style = MaterialTheme.typography.labelSmall
                                        )
                                    }
                                    OutlinedButton(
                                        onClick = { onRevokeUserSessions(user.id) },
                                        contentPadding = PaddingValues(horizontal = 8.dp, vertical = 2.dp),
                                        modifier = Modifier.height(36.dp)
                                    ) {
                                        Text(
                                            text = stringResource(R.string.admin_users_revoke),
                                            style = MaterialTheme.typography.labelSmall
                                        )
                                    }
                                    IconButton(
                                        onClick = { onDeleteUser(user.id) },
                                        modifier = Modifier.minimumInteractiveComponentSize()
                                    ) {
                                        Icon(
                                            imageVector = Icons.Outlined.Delete,
                                            contentDescription = stringResource(R.string.admin_users_delete),
                                            tint = MaterialTheme.colorScheme.error,
                                            modifier = Modifier.size(18.dp)
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
