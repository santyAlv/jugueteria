package com.jugueteria.app

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.camera.core.ImageAnalysis
import androidx.camera.mlkit.vision.MlKitAnalyzer
import androidx.camera.view.LifecycleCameraController
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import com.google.mlkit.vision.barcode.BarcodeScanner
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode

/**
 * Lee un código de barras con la cámara (CameraX + ML Kit) y lo devuelve
 * a la pantalla que la abrió en el extra [CODIGO].
 */
class EscanerActivity : AppCompatActivity() {

    companion object { const val CODIGO = "codigo" }

    private var escaner: BarcodeScanner? = null
    private var leido = false

    private val pedirPermiso = registerForActivityResult(ActivityResultContracts.RequestPermission()) { concedido ->
        if (concedido) iniciarCamara() else {
            aviso("Se necesita permiso de cámara para escanear")
            finish()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_escaner)
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
            iniciarCamara()
        } else {
            pedirPermiso.launch(Manifest.permission.CAMERA)
        }
    }

    private fun iniciarCamara() {
        val opciones = BarcodeScannerOptions.Builder()
            .setBarcodeFormats(
                Barcode.FORMAT_EAN_13, Barcode.FORMAT_EAN_8, Barcode.FORMAT_UPC_A, Barcode.FORMAT_UPC_E,
                Barcode.FORMAT_CODE_128, Barcode.FORMAT_CODE_39, Barcode.FORMAT_QR_CODE,
            )
            .build()
        val scanner = BarcodeScanning.getClient(opciones).also { escaner = it }
        val principal = ContextCompat.getMainExecutor(this)
        val camara = LifecycleCameraController(this)

        camara.setImageAnalysisAnalyzer(
            principal,
            MlKitAnalyzer(listOf(scanner), ImageAnalysis.COORDINATE_SYSTEM_VIEW_REFERENCED, principal) { resultado ->
                val codigo = resultado.getValue(scanner)?.firstOrNull()?.rawValue
                if (codigo.isNullOrBlank() || leido) return@MlKitAnalyzer
                leido = true
                setResult(RESULT_OK, Intent().putExtra(CODIGO, codigo.trim()))
                finish()
            },
        )
        camara.bindToLifecycle(this)
        findViewById<PreviewView>(R.id.vistaCamara).controller = camara
    }

    override fun onDestroy() {
        escaner?.close()
        super.onDestroy()
    }
}
