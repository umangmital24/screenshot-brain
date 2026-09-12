package com.umangmittal.screenshotmemory

import android.content.Context
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import java.util.concurrent.TimeUnit

class PendingSyncWorker(appContext: Context, workerParams: WorkerParameters) : Worker(appContext, workerParams) {
  override fun doWork(): Result {
    return try {
      UploadHeadlessTaskService.enqueueSync(applicationContext)
      Result.success()
    } catch (_: Exception) {
      Result.retry()
    }
  }
}

object PendingSyncScheduler {
  private const val ONE_TIME_WORK = "samhaal-pending-sync"
  private const val PERIODIC_WORK = "samhaal-pending-sync-periodic"

  private fun networkConstraints() = Constraints.Builder()
    .setRequiredNetworkType(NetworkType.CONNECTED)
    .build()

  fun scheduleNow(context: Context) {
    val request = OneTimeWorkRequestBuilder<PendingSyncWorker>()
      .setConstraints(networkConstraints())
      .build()
    WorkManager.getInstance(context).enqueueUniqueWork(
      ONE_TIME_WORK,
      ExistingWorkPolicy.REPLACE,
      request,
    )
  }

  // One-time work is scheduled immediately whenever a capture enters the local outbox.
  // This low-frequency repair sweep handles edge cases such as process death without
  // waking the app every 15 minutes all day.
  fun ensurePeriodic(context: Context) {
    val request = PeriodicWorkRequestBuilder<PendingSyncWorker>(6, TimeUnit.HOURS)
      .setConstraints(networkConstraints())
      .build()
    WorkManager.getInstance(context).enqueueUniquePeriodicWork(
      PERIODIC_WORK,
      ExistingPeriodicWorkPolicy.KEEP,
      request,
    )
  }
}
