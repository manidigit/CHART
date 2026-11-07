package es.manico.chartintelligence.data.repository

import com.google.common.truth.Truth.assertThat
import com.google.firebase.firestore.FirebaseFirestoreException
import es.manico.chartintelligence.base.FirestoreEmulatorTestBase
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.Assert.assertThrows
import org.junit.Test

class UserAccountRepositoryRuleTest : FirestoreEmulatorTestBase() {

    @Test
    fun upsertUserAccount_authenticatedOwner_createsAndUpdatesProfile() = runBlocking {
        val uid = signInTestUser(ALICE_EMAIL)
        val repository = UserAccountRepository(firestore)

        val createResult = withTimeout(DEFAULT_TIMEOUT_MS) {
            repository.upsertUserAccount(
                username = "mani_owner",
                email = ALICE_EMAIL,
                languageCode = "fa",
                isDarkTheme = true
            )
        }
        assertThat(createResult.isSuccess).isTrue()
        assertThat(createResult.getOrThrow()).isEqualTo(uid)

        val fetched = withTimeout(DEFAULT_TIMEOUT_MS) {
            repository.getUserAccount().getOrThrow()
        }
        assertThat(fetched).isNotNull()
        assertThat(fetched?.username).isEqualTo("mani_owner")
        assertThat(fetched?.email).isEqualTo(ALICE_EMAIL)
    }

    @Test
    fun observeUserAccount_authenticatedOwner_emitsRealtimeProfile() = runBlocking {
        signInTestUser(ALICE_EMAIL)
        val repository = UserAccountRepository(firestore)
        withTimeout(DEFAULT_TIMEOUT_MS) {
            repository.upsertUserAccount("alice_trader", ALICE_EMAIL, "en", false).getOrThrow()
        }

        val emitted = withTimeout(FLOW_TIMEOUT_MS) {
            repository.observeUserAccount().first { it != null && it.username == "alice_trader" }
        }
        assertThat(emitted?.email).isEqualTo(ALICE_EMAIL)
        assertThat(emitted?.languageCode).isEqualTo("en")
    }

    @Test
    fun getUserAccount_crossUserAccess_failsWithPermissionDenied() = runBlocking {
        val aliceUid = signInTestUser(ALICE_EMAIL)
        val aliceRepo = UserAccountRepository(firestore)
        withTimeout(DEFAULT_TIMEOUT_MS) {
            aliceRepo.upsertUserAccount("alice", ALICE_EMAIL).getOrThrow()
        }

        signInTestUser(BOB_EMAIL)
        val bobRepo = UserAccountRepository(firestore)
        val result = withTimeout(DEFAULT_TIMEOUT_MS) {
            bobRepo.getUserAccount(targetUid = aliceUid)
        }
        assertThat(result.isFailure).isTrue()
        val firestoreEx = result.exceptionOrNull()?.unwrapFirestoreException()
        assertThat(firestoreEx?.code).isEqualTo(FirebaseFirestoreException.Code.PERMISSION_DENIED)
    }

    @Test
    fun getUserAccount_unauthenticatedCaller_failsWithPermissionDenied() = runBlocking {
        val aliceUid = signInTestUser(ALICE_EMAIL)
        val aliceRepo = UserAccountRepository(firestore)
        withTimeout(DEFAULT_TIMEOUT_MS) {
            aliceRepo.upsertUserAccount("alice", ALICE_EMAIL).getOrThrow()
        }

        auth.signOut()
        val unauthRepo = UserAccountRepository(firestore)
        val result = withTimeout(DEFAULT_TIMEOUT_MS) {
            unauthRepo.getUserAccount(targetUid = aliceUid)
        }
        assertThat(result.isFailure).isTrue()
        val firestoreEx = result.exceptionOrNull()?.unwrapFirestoreException()
        assertThat(firestoreEx?.code).isEqualTo(FirebaseFirestoreException.Code.PERMISSION_DENIED)
    }

    private companion object {
        const val ALICE_EMAIL = "alice@chart.manico.es"
        const val BOB_EMAIL = "bob@chart.manico.es"
        const val DEFAULT_TIMEOUT_MS = 5000L
        const val FLOW_TIMEOUT_MS = 3000L
    }
}
