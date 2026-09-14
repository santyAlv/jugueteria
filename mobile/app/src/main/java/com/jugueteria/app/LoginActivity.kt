package com.jugueteria.app

import android.content.Intent
import android.os.Bundle
import android.widget.Button
import android.widget.EditText
import androidx.appcompat.app.AppCompatActivity

class LoginActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Api.iniciar(this)
        if (Api.token != null) return irAlMenu()

        setContentView(R.layout.activity_login)
        val email = findViewById<EditText>(R.id.txtEmail)
        val password = findViewById<EditText>(R.id.txtPassword)
        val servidor = findViewById<EditText>(R.id.txtServidor)
        val ingresar = findViewById<Button>(R.id.btnIngresar)
        servidor.setText(Api.servidor)

        ingresar.setOnClickListener {
            // Ingreso de campos clave
            if (email.text.isBlank()) return@setOnClickListener run { email.error = "Ingresá tu email" }
            if (password.text.isEmpty()) return@setOnClickListener run { password.error = "Ingresá tu contraseña" }
            if (!servidor.text.startsWith("http")) return@setOnClickListener run { servidor.error = "Ej: http://192.168.0.10:3000" }

            Api.servidor = servidor.text.toString()
            ingresar.isEnabled = false
            ingresar.text = "Ingresando..."
            // Validación de credenciales
            enSegundoPlano(
                { Api.login(email.text.toString().trim(), password.text.toString()) },
                siFalla = { ingresar.isEnabled = true; ingresar.text = "Iniciar sesión" },
            ) { irAlMenu() }
        }
    }

    private fun irAlMenu() {
        startActivity(Intent(this, MenuActivity::class.java))
        finish()
    }
}
