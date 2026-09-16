package com.umangmittal.screenshotmemory

import android.graphics.Rect
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.devanagari.DevanagariTextRecognizerOptions
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import java.util.Locale

/**
 * Privacy-safe multilingual OCR for Samhaal.
 *
 * Both recognizers run entirely on-device. Only the merged derived text and block geometry
 * are returned to callers; screenshot pixels never leave the device through this helper.
 */
object MultilingualOcr {
  data class Block(
    val text: String,
    val left: Double,
    val top: Double,
    val width: Double,
    val height: Double,
  )

  data class Result(
    val text: String,
    val blocks: List<Block>,
    val scripts: List<String>,
  )

  fun recognize(
    image: InputImage,
    imageWidth: Int,
    imageHeight: Int,
    onSuccess: (Result) -> Unit,
    onFailure: (Exception) -> Unit,
  ) {
    val latin = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
    val devanagari = TextRecognition.getClient(DevanagariTextRecognizerOptions.Builder().build())
    val latinTask = latin.process(image)
    val devanagariTask = devanagari.process(image)

    Tasks.whenAllComplete(latinTask, devanagariTask)
      .addOnCompleteListener {
        try {
          val recognized = mutableListOf<Pair<String, com.google.mlkit.vision.text.Text>>()
          if (latinTask.isSuccessful) latinTask.result?.let { recognized += "latin" to it }
          if (devanagariTask.isSuccessful) devanagariTask.result?.let { recognized += "devanagari" to it }

          if (recognized.isEmpty()) {
            val cause = latinTask.exception ?: devanagariTask.exception
            onFailure(cause ?: IllegalStateException("All on-device OCR recognizers failed"))
            return@addOnCompleteListener
          }

          val candidates = recognized.flatMap { (_, result) ->
            result.textBlocks.mapNotNull { block ->
              val box = block.boundingBox ?: return@mapNotNull null
              if (imageWidth <= 0 || imageHeight <= 0) return@mapNotNull null
              Candidate(block.text.trim(), box)
            }
          }
            .filter { it.text.isNotBlank() }
            .sortedWith(compareBy<Candidate>({ it.box.top }, { it.box.left }))

          val deduped = mutableListOf<Candidate>()
          for (candidate in candidates) {
            val duplicate = deduped.any { existing -> isDuplicate(existing, candidate) }
            if (!duplicate) deduped += candidate
          }

          val blocks = deduped.take(160).map { candidate ->
            Block(
              text = candidate.text.take(1200),
              left = candidate.box.left.toDouble() / imageWidth,
              top = candidate.box.top.toDouble() / imageHeight,
              width = candidate.box.width().toDouble() / imageWidth,
              height = candidate.box.height().toDouble() / imageHeight,
            )
          }

          val mergedText = blocks.joinToString("\n") { it.text }.trim().ifBlank {
            recognized.joinToString("\n") { it.second.text.trim() }.trim()
          }

          onSuccess(
            Result(
              text = mergedText,
              blocks = blocks,
              scripts = recognized.map { it.first },
            )
          )
        } catch (error: Exception) {
          onFailure(error)
        } finally {
          latin.close()
          devanagari.close()
        }
      }
  }

  private data class Candidate(val text: String, val box: Rect)

  private fun normalized(value: String): String =
    value.lowercase(Locale.ROOT).replace(Regex("\\s+"), " ").trim()

  private fun isDuplicate(a: Candidate, b: Candidate): Boolean {
    val aText = normalized(a.text)
    val bText = normalized(b.text)
    if (aText.isBlank() || bText.isBlank()) return false

    // Identical OCR output from both script models should only be indexed once.
    if (aText == bText) return true

    // For the same physical region, prefer the richer reading. This avoids duplicate Latin
    // UI text while still preserving Devanagari lines that the Latin model cannot read.
    val overlap = intersectionOverUnion(a.box, b.box)
    if (overlap >= 0.72) {
      if (aText.contains(bText) || bText.contains(aText)) return true
    }
    return false
  }

  private fun intersectionOverUnion(a: Rect, b: Rect): Double {
    val left = maxOf(a.left, b.left)
    val top = maxOf(a.top, b.top)
    val right = minOf(a.right, b.right)
    val bottom = minOf(a.bottom, b.bottom)
    if (right <= left || bottom <= top) return 0.0

    val intersection = (right - left).toDouble() * (bottom - top).toDouble()
    val union = a.width().toDouble() * a.height().toDouble() +
      b.width().toDouble() * b.height().toDouble() - intersection
    return if (union <= 0.0) 0.0 else intersection / union
  }
}
