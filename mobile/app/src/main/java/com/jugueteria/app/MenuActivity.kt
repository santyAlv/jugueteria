package com.jugueteria.app

import android.content.Intent
import android.os.Bundle
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity

class MenuActivity : AppCompatActivity() {

    // Caso de Uso 3: escanear -> Buscar Producto -> Registrar Ingreso (existe) o Registrar Nuevo (no existe)
    private val escaner = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { r ->
        val codigo = r.data?.getStringExtra(EscanerActivity.CODIGO) ?: return@registerForActivityResult
        enSegundoPlano({ Api.buscarPorCodigo(codigo) }) { producto ->
            if (producto != null) {
                startActivity(Intent(this, IngresoActivity::class.java).putExtra("id", producto.getInt("id")))
            } else {
                aviso("Código $codigo no registrado: cargá el producto nuevo")
                startActivity(Intent(this, ProductoActivity::class.java).putExtra("codigo", codigo))
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Api.iniciar(this)
        setContentView(R.layout.activity_menu)

        findViewById<TextView>(R.id.txtUsuario).text = Api.nombreUsuario
        findViewById<TextView>(R.id.txtRol).text = "Rol: ${Api.rol}"

        findViewById<TextView>(R.id.btnEscanear).setOnClickListener {
            escaner.launch(Intent(this, EscanerActivity::class.java))
        }
        findViewById<TextView>(R.id.btnProductos).setOnClickListener {
            startActivity(Intent(this, ProductosActivity::class.java))
        }
        findViewById<TextView>(R.id.btnCerrarSesion).setOnClickListener {
            Api.cerrarSesion()
            startActivity(Intent(this, LoginActivity::class.java))
            finish()
        }
    }
}
