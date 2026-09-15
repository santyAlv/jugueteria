package com.jugueteria.app

import android.content.Intent
import android.os.Bundle
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

/**
 * Primera pantalla: se configuran la IP y el puerto de la PC donde corre la API.
 * Queda guardado en el celular, asi que al cambiar de red solo hay que editarlo aca.
 */
class ConfiguracionActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Api.iniciar(this)
        setContentView(R.layout.activity_configuracion)

        val ip = findViewById<EditText>(R.id.txtIp)
        val puerto = findViewById<EditText>(R.id.txtPuerto)
        val estado = findViewById<TextView>(R.id.txtEstado)
        val probar = findViewById<Button>(R.id.btnProbar)
        val continuar = findViewById<Button>(R.id.btnContinuar)

        ip.setText(Api.ip)
        puerto.setText(Api.puerto)

        /** Valida los campos y los guarda. Devuelve false si algo esta mal cargado. */
        fun guardar(): Boolean {
            val nuevaIp = ip.text.toString().trim()
            val nuevoPuerto = puerto.text.toString().trim()
            if (nuevaIp.isEmpty()) return false.also { ip.error = "Ingresá la IP (ej: 192.168.0.10)" }
            if (nuevaIp.contains("/") || nuevaIp.contains(":")) {
                return false.also { ip.error = "Solo la IP, sin http:// ni el puerto" }
            }
            val numeroPuerto = nuevoPuerto.toIntOrNull()
            if (numeroPuerto == null || numeroPuerto !in 1..65535) {
                return false.also { puerto.error = "Puerto inválido (ej: 3000)" }
            }
            // Si cambia el servidor, el token de la sesión anterior ya no sirve.
            if (nuevaIp != Api.ip || nuevoPuerto != Api.puerto) Api.cerrarSesion()
            Api.ip = nuevaIp
            Api.puerto = nuevoPuerto
            estado.text = "Servidor: ${Api.servidor}"
            return true
        }

        probar.setOnClickListener {
            if (!guardar()) return@setOnClickListener
            probar.isEnabled = false
            estado.text = "Probando ${Api.servidor} ..."
            enSegundoPlano(
                { Api.probarConexion() },
                siFalla = {
                    probar.isEnabled = true
                    estado.text = "No se pudo conectar con ${Api.servidor}"
                },
            ) { motivo ->
                probar.isEnabled = true
                if (motivo == null) {
                    estado.text = "Conexión correcta con ${Api.servidor}"
                    aviso("Conexión correcta")
                } else {
                    estado.text = motivo
                }
            }
        }

        continuar.setOnClickListener {
            if (!guardar()) return@setOnClickListener
            startActivity(Intent(this, LoginActivity::class.java))
            finish()
        }
    }
}
