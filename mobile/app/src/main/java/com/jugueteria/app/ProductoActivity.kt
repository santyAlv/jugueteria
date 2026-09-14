package com.jugueteria.app

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.widget.doAfterTextChanged
import org.json.JSONObject
import kotlin.math.roundToLong

/**
 * Registrar Nuevo producto (sin extra "id") o Modificar Información del Producto (con extra "id").
 * Puede recibir el extra "codigo" cuando viene del escáner.
 */
class ProductoActivity : AppCompatActivity() {

    private var productoId = 0
    private var cargado = false
    private lateinit var nombre: EditText
    private lateinit var codigo: EditText
    private lateinit var precioIngreso: EditText
    private lateinit var ganancia: EditText
    private lateinit var iva: EditText
    private lateinit var stockInicial: EditText
    private lateinit var precioVenta: TextView
    private lateinit var guardar: Button

    private val escaner = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { r ->
        r.data?.getStringExtra(EscanerActivity.CODIGO)?.let { codigo.setText(it) }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Api.iniciar(this)
        setContentView(R.layout.activity_producto)

        productoId = intent.getIntExtra("id", 0)
        nombre = findViewById(R.id.txtNombre)
        codigo = findViewById(R.id.txtCodigo)
        precioIngreso = findViewById(R.id.txtPrecioIngreso)
        ganancia = findViewById(R.id.txtGanancia)
        iva = findViewById(R.id.txtIva)
        stockInicial = findViewById(R.id.txtStockInicial)
        precioVenta = findViewById(R.id.txtPrecioVenta)
        guardar = findViewById(R.id.btnGuardar)

        findViewById<View>(R.id.btnVolver).setOnClickListener { finish() }
        findViewById<View>(R.id.btnEscanearCodigo).setOnClickListener {
            escaner.launch(Intent(this, EscanerActivity::class.java))
        }
        intent.getStringExtra("codigo")?.let { codigo.setText(it) }
        listOf(precioIngreso, ganancia, iva).forEach { it.doAfterTextChanged { actualizarPrecioVenta() } }
        guardar.setOnClickListener { guardarProducto() }

        if (productoId != 0) {
            findViewById<TextView>(R.id.txtTitulo).text = "Modificar producto"
            guardar.text = "Modificar"
            findViewById<View>(R.id.grupoStockInicial).visibility = View.GONE
            findViewById<View>(R.id.txtStockActual).visibility = View.VISIBLE
            findViewById<View>(R.id.btnIrIngreso).apply {
                visibility = View.VISIBLE
                setOnClickListener {
                    startActivity(Intent(this@ProductoActivity, IngresoActivity::class.java).putExtra("id", productoId))
                }
            }
        }
    }

    override fun onResume() {
        super.onResume()
        if (productoId == 0) return
        enSegundoPlano({ Api.obtenerProducto(productoId) }) { p ->
            // El stock se refresca siempre (puede cambiar en Ingreso); los campos solo la primera vez
            findViewById<TextView>(R.id.txtStockActual).text = "Stock actual: ${p.getInt("stock")} unidades"
            if (cargado) return@enSegundoPlano
            cargado = true
            nombre.setText(p.getString("nombre"))
            codigo.setText(p.optString("codigo_barras"))
            precioIngreso.setText(sinCeros(p.getDouble("precio_ingreso")))
            ganancia.setText(sinCeros(p.getDouble("porcentaje_ganancia")))
            iva.setText(sinCeros(p.getDouble("iva")))
        }
    }

    private fun sinCeros(v: Double) = if (v % 1.0 == 0.0) v.toLong().toString() else v.toString()

    // Mismo cálculo que la columna generada `precio` de MySQL (calcularPrecioVenta)
    private fun actualizarPrecioVenta() {
        val pi = numero(precioIngreso.text)
        val g = numero(ganancia.text)
        val i = numero(iva.text)
        precioVenta.text = if (pi == null || g == null || i == null) {
            "Precio de venta: -"
        } else {
            "Precio de venta: " + pesos((pi * (1 + g / 100) * (1 + i / 100) * 100).roundToLong() / 100.0)
        }
    }

    private fun guardarProducto() {
        val n = nombre.text.toString().trim()
        if (n.isEmpty()) return run { nombre.error = "El nombre es obligatorio" }
        val pi = numero(precioIngreso.text) ?: return run { precioIngreso.error = "Ingresá un precio válido" }
        val g = numero(ganancia.text) ?: return run { ganancia.error = "Número inválido" }
        val i = numero(iva.text)?.takeIf { it in 0.0..100.0 } ?: return run { iva.error = "Entre 0 y 100" }

        val datos = JSONObject()
            .put("nombre", n)
            .put("codigo_barras", codigo.text.toString().trim())
            .put("precio_ingreso", pi)
            .put("porcentaje_ganancia", g)
            .put("iva", i)
        if (productoId == 0) {
            val stock = stockInicial.text.toString().trim().ifEmpty { "0" }.toIntOrNull()
                ?: return run { stockInicial.error = "Número entero" }
            datos.put("stock_inicial", stock)
        }

        guardar.isEnabled = false
        enSegundoPlano(
            { if (productoId == 0) Api.crearProducto(datos) else Api.modificarProducto(productoId, datos) },
            siFalla = { guardar.isEnabled = true },
        ) { p ->
            aviso(
                if (productoId == 0) "Producto cargado. Código de barras: ${p.getString("codigo_barras")}"
                else "Producto modificado"
            )
            finish()
        }
    }
}
