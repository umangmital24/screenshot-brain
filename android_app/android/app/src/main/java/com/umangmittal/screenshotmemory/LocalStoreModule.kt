package com.umangmittal.screenshotmemory

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import android.net.Uri
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File

private class SamhaalDbHelper(context: Context) : SQLiteOpenHelper(context, "samhaal-local.db", null, 1) {
  override fun onCreate(db: SQLiteDatabase) {
    db.execSQL(
      """CREATE TABLE IF NOT EXISTS pending_captures (
        client_event_id TEXT PRIMARY KEY NOT NULL,
        payload TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )""".trimIndent()
    )
    db.execSQL(
      """CREATE TABLE IF NOT EXISTS local_media (
        memory_id TEXT PRIMARY KEY NOT NULL,
        uri TEXT NOT NULL,
        screenshot_id TEXT,
        saved_at TEXT NOT NULL
      )""".trimIndent()
    )
    db.execSQL("CREATE INDEX IF NOT EXISTS idx_pending_updated ON pending_captures(updated_at)")
  }

  override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) = Unit
}

class LocalStoreModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  private val helper by lazy { SamhaalDbHelper(reactContext.applicationContext) }

  override fun getName() = "LocalStore"

  @ReactMethod
  fun upsertPendingCapture(clientEventId: String, payload: String, promise: Promise) {
    try {
      val values = ContentValues().apply {
        put("client_event_id", clientEventId)
        put("payload", payload)
        put("updated_at", System.currentTimeMillis())
      }
      helper.writableDatabase.insertWithOnConflict(
        "pending_captures",
        null,
        values,
        SQLiteDatabase.CONFLICT_REPLACE,
      )
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("SQLITE_PENDING_UPSERT", e)
    }
  }

  @ReactMethod
  fun deletePendingCapture(clientEventId: String, promise: Promise) {
    try {
      helper.writableDatabase.delete("pending_captures", "client_event_id=?", arrayOf(clientEventId))
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("SQLITE_PENDING_DELETE", e)
    }
  }

  @ReactMethod
  fun getPendingCaptures(promise: Promise) {
    try {
      val rows = Arguments.createArray()
      helper.readableDatabase.rawQuery(
        "SELECT payload FROM pending_captures ORDER BY updated_at ASC",
        null
      ).use { cursor ->
        while (cursor.moveToNext()) rows.pushString(cursor.getString(0))
      }
      promise.resolve(rows)
    } catch (e: Exception) {
      promise.reject("SQLITE_PENDING_LIST", e)
    }
  }

  @ReactMethod
  fun upsertLocalMedia(memoryId: String, uri: String, screenshotId: String?, savedAt: String, promise: Promise) {
    try {
      val values = ContentValues().apply {
        put("memory_id", memoryId)
        put("uri", uri)
        if (screenshotId == null) putNull("screenshot_id") else put("screenshot_id", screenshotId)
        put("saved_at", savedAt)
      }
      helper.writableDatabase.insertWithOnConflict(
        "local_media",
        null,
        values,
        SQLiteDatabase.CONFLICT_REPLACE,
      )
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("SQLITE_MEDIA_UPSERT", e)
    }
  }

  @ReactMethod
  fun getLocalMedia(promise: Promise) {
    try {
      val rows = Arguments.createArray()
      helper.readableDatabase.rawQuery(
        "SELECT memory_id,uri,screenshot_id,saved_at FROM local_media",
        null
      ).use { cursor ->
        while (cursor.moveToNext()) {
          val row = Arguments.createMap()
          row.putString("memory_id", cursor.getString(0))
          row.putString("uri", cursor.getString(1))
          if (cursor.isNull(2)) row.putNull("screenshot_id") else row.putString("screenshot_id", cursor.getString(2))
          row.putString("saved_at", cursor.getString(3))
          rows.pushMap(row)
        }
      }
      promise.resolve(rows)
    } catch (e: Exception) {
      promise.reject("SQLITE_MEDIA_LIST", e)
    }
  }

  @ReactMethod
  fun isUriAvailable(rawUri: String, promise: Promise) {
    try {
      val uri = Uri.parse(rawUri)
      val available = when (uri.scheme?.lowercase()) {
        "content" -> reactContext.contentResolver.openAssetFileDescriptor(uri, "r")?.use { true } ?: false
        "file" -> File(uri.path ?: "").exists()
        null, "" -> File(rawUri).exists()
        else -> true
      }
      promise.resolve(available)
    } catch (_: Exception) {
      promise.resolve(false)
    }
  }
}
