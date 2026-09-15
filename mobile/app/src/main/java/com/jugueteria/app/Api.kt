package com.jugueteria.app

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.util.Log
import android.widget.Toast
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.text.NumberFormat
import java.util.Locale
import kotlin.concurrent.thread



/** Cliente de la API REST (backend Node.js) + datos de la sesión. */
object Api {
    private lateinit var prefs: SharedPreferences

    fun iniciar(ctx: Context) {
        if (!::prefs.isInitialized) prefs = ctx.applicationContext.getSharedPreferences("sesion", Context.MODE_PRIVATE)
    }

    /** IP y puerto de la PC donde corre la API: se configuran en ConfiguracionActivity. */
    var ip: String
        get() = prefs.getString("ip", "192.168.0.10")!!
        set(v) = prefs.edit().putString("ip", v.trim()).apply()

    var puerto: String
        get() = prefs.getString("puerto", "3000")!!
        set(v) = prefs.edit().putString("puerto", v.trim()).apply()

    val servidor: String get() = "http://$ip:$puerto"

    val token: String? get() = prefs.getString("token", null)
    val nombreUsuario: String get() = prefs.getString("nombre", "")!!
    val rol: String get() = prefs.getString("rol", "")!!

    class ErrorApi(val estado: Int, mensaje: String) : Exception(mensaje)

    private fun pedir(metodo: String, ruta: String, cuerpo: JSONObject? = null): String {
        val con = URL("$servidor/api$ruta").openConnection() as HttpURLConnection
        try {
            con.requestMethod = metodo
            con.connectTimeout = 5000
            con.readTimeout = 10000
            con.setRequestProperty("Content-Type", "application/json")
            token?.let { con.setRequestProperty("Authorization", "Bearer $it") }
            if (cuerpo != null) {
                con.doOutput = true
                con.outputStream.use { it.write(cuerpo.toString().toByteArray()) }
            }
            val estado = con.responseCode
            val texto = (if (estado < 400) con.inputStream else con.errorStream)
                ?.bufferedReader()?.use { it.readText() } ?: ""
            if (estado >= 400) {
                val mensaje = runCatching { JSONObject(texto).getString("error") }.getOrDefault("Error $estado")
                throw ErrorApi(estado, mensaje)
            }
            return texto
        } finally {
            con.disconnect()
        }
    }

    /**
     * Verifica la IP y el puerto configurados. Lanza IOException si no hay nadie escuchando.
     * Devuelve null si respondió la API; si no, el motivo (contestó otra cosa).
     */
    fun probarConexion(): String? = try {
        if (JSONObject(pedir("GET", "/ping")).optBoolean("ok")) null
        else "Responde algo en ese puerto, pero no es la API"
    } catch (e: ErrorApi) {
        "Contestó ${e.estado} en /api/ping: reiniciá el backend (node server.js)"
    }

    // --- Caso de Uso 1: Iniciar sesión ---
    fun login(email: String, password: String) {
        val r = JSONObject(pedir("POST", "/login", JSONObject().put("email", email).put("password", password)))
        val u = r.getJSONObject("usuario")
        prefs.edit()
            .putString("token", r.getString("token"))
            .putString("nombre", u.getString("nombre_usuario"))
            .putString("rol", u.getString("rol"))
            .apply()
    }

    fun cerrarSesion() = prefs.edit().remove("token").remove("nombre").remove("rol").apply()

    // --- Productos ---
    fun listarProductos() = JSONArray(pedir("GET", "/productos"))

    fun obtenerProducto(id: Int) = JSONObject(pedir("GET", "/productos/$id"))

    /** Buscar Producto por código de barras. Devuelve null si no existe. */
    fun buscarPorCodigo(codigo: String): JSONObject? = try {
        JSONObject(pedir("GET", "/productos/codigo/" + URLEncoder.encode(codigo, "UTF-8").replace("+", "%20")))
    } catch (e: ErrorApi) {
        if (e.estado == 404) null else throw e
    }

    fun crearProducto(datos: JSONObject) = JSONObject(pedir("POST", "/productos", datos))

    fun modificarProducto(id: Int, datos: JSONObject) = JSONObject(pedir("PUT", "/productos/$id", datos))

    fun registrarIngreso(id: Int, cantidad: Int) =
        JSONObject(pedir("POST", "/productos/$id/ingreso", JSONObject().put("cantidad", cantidad)))

    fun movimientos(id: Int) = JSONArray(pedir("GET", "/productos/$id/movimientos"))
}

// ---------------------------------------------------------------------------
// Helpers de pantalla
// ---------------------------------------------------------------------------

private val formatoPesos = NumberFormat.getCurrencyInstance(Locale("es", "AR"))
fun pesos(valor: Double): String = formatoPesos.format(valor)

/** Acepta "1500,50" o "1500.50". */
fun numero(texto: CharSequence?): Double? = texto?.toString()?.trim()?.replace(',', '.')?.toDoubleOrNull()

fun Activity.aviso(mensaje: String) = Toast.makeText(this, mensaje, Toast.LENGTH_LONG).show()

/**
 * Ejecuta la llamada a la API fuera del hilo principal y muestra el resultado.
 * Caso de uso "Error": cualquier falla se le muestra al usuario con un mensaje claro.
 */
fun <T> Activity.enSegundoPlano(tarea: () -> T, siFalla: () -> Unit = {}, alTerminar: (T) -> Unit) {
    thread {
        try {
            val resultado = tarea()
            runOnUiThread { if (!isFinishing) alTerminar(resultado) }
        } catch (e: Exception) {
            Log.e("error",e.toString())
            runOnUiThread {
                siFalla()
                when {
                    e is Api.ErrorApi && e.estado == 401 && this !is LoginActivity -> {
                        aviso(e.message ?: "Sesión vencida")
                        Api.cerrarSesion()
                        startActivity(Intent(this, LoginActivity::class.java)
                            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK))
                    }
                    e is Api.ErrorApi -> aviso(e.message ?: "Error")
                    e is IOException -> aviso("No se pudo conectar con el servidor:$e")

                   // e is IOException -> aviso("No se pudo conectar con el servidor (${Api.servidor})")
                    else -> aviso("Error inesperado: ${e.message}")
                }
            }
        }
    }
}
