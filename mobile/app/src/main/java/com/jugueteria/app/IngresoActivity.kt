package com.jugueteria.app

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

/** Registrar Ingreso de mercadería + Actualización de Stock de un producto existente. */
class IngresoActivity : AppCompatActivity() {

    private var productoId = 0
    private val fechaApi = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
        timeZone = TimeZone.getTimeZone("UTC")
    }
    private val fechaPantalla = SimpleDateFormat("dd/MM/yyyy HH:mm", Locale.getDefault())

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Api.iniciar(this)
        setContentView(R.layout.activity_ingreso)
        productoId = intent.getIntExtra("id", 0)

        findViewById<View>(R.id.btnVolver).setOnClickListener { finish() }
        findViewById<View>(R.id.btnModificar).setOnClickListener {
            startActivity(Intent(this, ProductoActivity::class.java).putExtra("id", productoId))
        }

        val cantidad = findViewById<EditText>(R.id.txtCantidad)
        val registrar = findViewById<Button>(R.id.btnRegistrar)
        registrar.setOnClickListener {
            val unidades = cantidad.text.toString().trim().toIntOrNull()
            if (unidades == null || unidades <= 0) return@setOnClickListener run { cantidad.error = "Cantidad mayor a 0" }

            registrar.isEnabled = false
            enSegundoPlano(
                { Api.registrarIngreso(productoId, unidades) to Api.movimientos(productoId) },
                siFalla = { registrar.isEnabled = true },
            ) { (producto, movimientos) ->
                registrar.isEnabled = true
                cantidad.text.clear()
                mostrarProducto(producto)
                mostrarMovimientos(movimientos)
                aviso("Ingreso registrado: +$unidades. Stock actual: ${producto.getInt("stock")}")
            }
        }
    }

    override fun onResume() {
        super.onResume()
        enSegundoPlano({ Api.obtenerProducto(productoId) to Api.movimientos(productoId) }) { (producto, movimientos) ->
            mostrarProducto(producto)
            mostrarMovimientos(movimientos)
        }
    }

    private fun mostrarProducto(p: JSONObject) {
        findViewById<TextView>(R.id.txtNombre).text = p.getString("nombre")
        findViewById<TextView>(R.id.txtCodigo).text = "Código: ${p.optString("codigo_barras")}"
        findViewById<TextView>(R.id.txtPrecio).text = "Precio de venta: ${pesos(p.getDouble("precio"))}"
        findViewById<TextView>(R.id.txtStock).text = "Stock actual: ${p.getInt("stock")}"
    }

    // obtenerTrazabilidad(): quién ingresó cuánto y cuándo
    private fun mostrarMovimientos(m: JSONArray) {
        val contenedor = findViewById<LinearLayout>(R.id.listaMovimientos)
        contenedor.removeAllViews()
        if (m.length() == 0) {
            contenedor.addView(fila("Sin movimientos todavía"))
            return
        }
        for (i in 0 until minOf(m.length(), 10)) {
            val mov = m.getJSONObject(i)
            val fecha = runCatching { fechaPantalla.format(fechaApi.parse(mov.getString("fecha_hora"))!!) }
                .getOrDefault(mov.getString("fecha_hora"))
            val signo = if (mov.getString("tipo_movimiento") == "INGRESO") "+" else "-"
            contenedor.addView(fila("$signo${mov.getInt("cantidad")}  ·  $fecha  ·  ${mov.getString("nombre_usuario")}"))
        }
    }

    private fun fila(texto: String) = TextView(this).apply {
        text = texto
        textSize = 15f
        setTextColor(getColor(R.color.negro))
        setPadding(8, 14, 8, 14)
    }
}
